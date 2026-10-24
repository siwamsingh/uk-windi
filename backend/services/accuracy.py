"""Leakage-safe accuracy calculations for hourly WINDFOR vs half-hourly FUELHH."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from math import sqrt
from typing import Any

from .elexon import parse_utc, iso_utc

HALF_HOUR = timedelta(minutes=30)
ONE_HOUR = timedelta(hours=1)


def _number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _metrics(rows: list[dict[str, Any]], metadata: dict[str, Any]) -> dict[str, Any]:
    complete = [row for row in rows if row["status"] == "Complete"]
    errors = [float(row["error_mw"]) for row in complete]
    absolute_errors = [abs(error) for error in errors]

    if errors:
        mae = sum(absolute_errors) / len(absolute_errors)
        rmse = sqrt(sum(error * error for error in errors) / len(errors))
        bias = sum(errors) / len(errors)
    else:
        mae = rmse = bias = None

    result: dict[str, Any] = {
        **metadata,
        "matched_intervals": len(complete),
        "pending_intervals": len(rows) - len(complete),
        "mae_mw": round(mae, 2) if mae is not None else None,
        "rmse_mw": round(rmse, 2) if rmse is not None else None,
        "bias_mw": round(bias, 2) if bias is not None else None,
        "forecast_resolution": "Hourly WINDFOR values",
        "actual_resolution": "Mean of the two half-hourly FUELHH values in each hour",
        "error_definition": "forecast_mw - actual_mw; positive bias means over-forecasting",
        "data": rows,
    }
    if not complete:
        result["message"] = "No complete hourly intervals are available for accuracy calculation. Check the publication window and forecast availability."
    return result


def _calculate(
    forecast_records: list[dict[str, Any]],
    actual_records: list[dict[str, Any]],
    from_time: datetime,
    to_time: datetime,
    cutoff_by_hour: dict[datetime, datetime],
    base_metadata: dict[str, Any],
) -> dict[str, Any]:
    """Select the latest eligible forecast per hourly target, then score it."""
    start = parse_utc(from_time)
    end = parse_utc(to_time)
    slots = sorted(cutoff_by_hour)
    slot_set = set(slots)

    # Pick the newest publication for each target hour, while checking its
    # target hour and decision cutoff. Forecasts after cutoff are never used.
    best_forecast: dict[datetime, dict[str, Any]] = {}
    best_key: dict[datetime, tuple[datetime, int]] = {}
    for record in forecast_records:
        try:
            target_time = parse_utc(record.get("startTime"))
            published_at = parse_utc(record.get("publishTime"))
        except (TypeError, ValueError):
            continue

        if target_time not in slot_set:
            continue
        if published_at > cutoff_by_hour[target_time]:
            continue

        generation = _number(record.get("generation"))
        if generation is None:
            continue

        try:
            revision = int(record.get("documentRevisionNumber") or 0)
        except (TypeError, ValueError):
            revision = 0
        key = (published_at, revision)
        if target_time not in best_key or key >= best_key[target_time]:
            best_key[target_time] = key
            best_forecast[target_time] = {
                "publishTime": published_at,
                "generation": generation,
            }

    # Actuals are half-hourly. Use both values in an hour to calculate an
    # hourly mean so the forecast and actual are compared at the same cadence.
    actual_by_hour: dict[datetime, dict[datetime, float | None]] = {}
    for record in actual_records:
        try:
            interval_start = parse_utc(record.get("startTime"))
        except (TypeError, ValueError):
            continue
        if not (start <= interval_start < end):
            continue
        hour_start = interval_start.replace(minute=0, second=0, microsecond=0)
        actual_by_hour.setdefault(hour_start, {})[interval_start] = _number(record.get("generation"))

    rows: list[dict[str, Any]] = []
    for hour_start in slots:
        expected_actual_times = (hour_start, hour_start + HALF_HOUR)
        hour_actuals = actual_by_hour.get(hour_start, {})
        valid_actual_count = sum(
            1 for timestamp in expected_actual_times
            if timestamp in hour_actuals and hour_actuals[timestamp] is not None
        )
        actual_mw: float | None = None
        if valid_actual_count == 2:
            actual_mw = sum(float(hour_actuals[timestamp]) for timestamp in expected_actual_times) / 2.0

        forecast = best_forecast.get(hour_start)
        forecast_mw = forecast["generation"] if forecast else None
        forecast_publish_time = iso_utc(forecast["publishTime"]) if forecast else None

        if forecast_mw is not None and actual_mw is not None:
            error = forecast_mw - actual_mw
            status = "Complete"
        else:
            error = None
            if forecast_mw is None and actual_mw is None:
                status = "PendingForecastAndActual"
            elif forecast_mw is None:
                status = "PendingForecast"
            else:
                status = "PendingActual"

        row = {
            "startTime": iso_utc(hour_start),
            "decision_time": iso_utc(cutoff_by_hour[hour_start]),
            "forecast_publishTime": forecast_publish_time,
            "forecast_mw": round(forecast_mw, 2) if forecast_mw is not None else None,
            "actual_mw": round(actual_mw, 2) if actual_mw is not None else None,
            "actual_half_hour_intervals": valid_actual_count,
            "error_mw": round(error, 2) if error is not None else None,
            "absolute_error_mw": round(abs(error), 2) if error is not None else None,
            "status": status,
        }
        rows.append(row)

    return _metrics(rows, base_metadata)


def calculate_forecast_accuracy(
    forecast_records: list[dict[str, Any]],
    actual_records: list[dict[str, Any]],
    from_time: datetime,
    to_time: datetime,
    decision_time: datetime,
) -> dict[str, Any]:
    """Score one delivery window against one explicitly supplied cutoff."""
    cutoff = parse_utc(decision_time)
    start = parse_utc(from_time)
    end = parse_utc(to_time)
    slots: list[datetime] = []
    cursor = start
    while cursor < end:
        slots.append(cursor)
        cursor += ONE_HOUR
    cutoff_by_hour = {slot: cutoff for slot in slots}

    return _calculate(
        forecast_records,
        actual_records,
        start,
        end,
        cutoff_by_hour,
        {
            "decision_time": iso_utc(cutoff),
            "decision_policy": "One fixed publication cutoff for all delivery hours",
            "from": iso_utc(start),
            "to": iso_utc(end),
        },
    )


def calculate_rolling_day_ahead_accuracy(
    forecast_records: list[dict[str, Any]],
    actual_records: list[dict[str, Any]],
    from_time: datetime,
    to_time: datetime,
    cutoff_hour_utc: int = 12,
) -> dict[str, Any]:
    """Score a date range using a separate noon-UTC cutoff before each day.

    Example: for delivery on 2026-01-01, cutoff is 2025-12-31 12:00 UTC.
    This is appropriate for a month-long day-ahead backtest; using one cutoff
    for every day in a month would be a different experiment.
    """
    start = parse_utc(from_time)
    end = parse_utc(to_time)
    slots: list[datetime] = []
    cutoff_by_hour: dict[datetime, datetime] = {}
    cursor = start
    while cursor < end:
        slots.append(cursor)
        previous_day = cursor.date() - timedelta(days=1)
        cutoff_by_hour[cursor] = datetime(
            previous_day.year, previous_day.month, previous_day.day,
            cutoff_hour_utc, 0, 0, tzinfo=timezone.utc,
        )
        cursor += ONE_HOUR

    return _calculate(
        forecast_records,
        actual_records,
        start,
        end,
        cutoff_by_hour,
        {
            "decision_time": None,
            "decision_policy": f"Rolling day-ahead: {cutoff_hour_utc:02d}:00 UTC on the previous day",
            "from": iso_utc(start),
            "to": iso_utc(end),
        },
    )
