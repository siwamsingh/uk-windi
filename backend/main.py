from __future__ import annotations

import asyncio
from datetime import datetime, time, timedelta, timezone

import httpx
from fastapi import FastAPI, HTTPException, Query

from services.accuracy import (
    calculate_forecast_accuracy,
    calculate_rolling_day_ahead_accuracy,
)
from services.elexon import (
    get_actual_wind_generation,
    get_wind_forecasts,
    iso_utc,
    parse_utc,
)

app = FastAPI(
    title="UK Wind Power Analytics API",
    description=(
        "Wind generation actuals and forecast accuracy using Elexon BMRS data. "
        "Accuracy compares hourly WINDFOR forecasts with hourly means of FUELHH actuals."
    ),
    version="1.0.0",
)


@app.get("/")
async def root():
    return {"message": "UK Wind Power Analytics API", "docs": "/docs"}


@app.get("/health")
async def health():
    return {"status": "ok"}


def _require_aware_utc(value: datetime, field_name: str) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise HTTPException(
            status_code=422,
            detail=f"'{field_name}' must include a timezone, for example 2026-01-01T00:00:00Z",
        )
    return value.astimezone(timezone.utc)


def _validate_hourly_window(start: datetime, end: datetime) -> None:
    if start >= end:
        raise HTTPException(status_code=422, detail="'from' must be earlier than 'to'.")
    for name, value in (("from", start), ("to", end)):
        if value.minute != 0 or value.second != 0 or value.microsecond != 0:
            raise HTTPException(
                status_code=422,
                detail=f"'{name}' must be aligned to an exact hour because WINDFOR forecasts are hourly.",
            )


@app.get("/api/actuals/wind", tags=["Actuals"])
async def actual_wind_generation(
    from_time: datetime = Query(..., alias="from", description="Delivery start, ISO-8601 with timezone"),
    to_time: datetime = Query(..., alias="to", description="Exclusive delivery end, ISO-8601 with timezone"),
):
    start = _require_aware_utc(from_time, "from")
    end = _require_aware_utc(to_time, "to")
    _validate_hourly_window(start, end)
    try:
        records = await get_actual_wind_generation(start, end)
        return {"count": len(records), "data": records}
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Could not retrieve valid Elexon actuals: {exc}") from exc


@app.get(
    "/api/forecasts/wind",
    tags=["Forecasts"],
    description="Here, from/to filter forecast publication time, not delivery startTime.",
)
async def wind_forecasts(
    from_time: datetime = Query(..., alias="from", description="Publication-time window start, ISO-8601 with timezone"),
    to_time: datetime = Query(..., alias="to", description="Publication-time window end, ISO-8601 with timezone"),
):
    start = _require_aware_utc(from_time, "from")
    end = _require_aware_utc(to_time, "to")
    if start > end:
        raise HTTPException(status_code=422, detail="'from' must be at or before 'to'.")
    try:
        records = await get_wind_forecasts(start, end)
        return {
            "count": len(records),
            "publication_window": {"from": iso_utc(start), "to": iso_utc(end)},
            "data": records,
        }
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Could not retrieve valid Elexon forecasts: {exc}") from exc


@app.get(
    "/api/analysis/accuracy",
    tags=["Analysis"],
    description=(
        "Scores a delivery window up to 24 hours long using one explicit forecast cutoff. "
        "All used forecasts must have publishTime <= decision_time. Use the rolling endpoint for a month."
    ),
)
async def forecast_accuracy(
    from_time: datetime = Query(..., alias="from", description="Delivery-window start, UTC recommended"),
    to_time: datetime = Query(..., alias="to", description="Exclusive delivery-window end, UTC recommended"),
    decision_time: datetime = Query(..., description="Forecast cutoff in ISO-8601, including timezone"),
):
    start = _require_aware_utc(from_time, "from")
    end = _require_aware_utc(to_time, "to")
    cutoff = _require_aware_utc(decision_time, "decision_time")
    _validate_hourly_window(start, end)

    if end - start > timedelta(days=1):
        raise HTTPException(
            status_code=422,
            detail="This endpoint scores at most 24 delivery hours with one cutoff. Use /api/analysis/accuracy/day-ahead for multi-day/monthly day-ahead backtesting.",
        )
    if cutoff >= start or cutoff.date() >= start.date():
        raise HTTPException(
            status_code=422,
            detail="For day-ahead accuracy, decision_time must be on the calendar day before the first delivery date and earlier than 'from'.",
        )

    # The requested delivery window determines actuals. The publication window
    # is instead anchored to decision_time and includes the prior 3 days.
    publication_from = cutoff - timedelta(days=3)
    try:
        actuals, forecasts = await asyncio.gather(
            get_actual_wind_generation(start, end),
            get_wind_forecasts(publication_from, cutoff),
        )
        result = calculate_forecast_accuracy(forecasts, actuals, start, end, cutoff)
        result.update({
            "actual_records_retrieved": len(actuals),
            "forecast_records_retrieved": len(forecasts),
            "forecast_publication_window": {
                "from": iso_utc(publication_from),
                "to": iso_utc(cutoff),
            },
        })
        return result
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Accuracy calculation could not complete: {exc}") from exc


@app.get(
    "/api/analysis/accuracy/day-ahead",
    tags=["Analysis"],
    description=(
        "Rolling day-ahead backtest. Each delivery day uses the forecast available by 12:00 UTC "
        "on the previous day. 'to' is exclusive. Use for January/monthly evaluations."
    ),
)
async def rolling_day_ahead_accuracy(
    from_time: datetime = Query(..., alias="from", description="Delivery range start at 00:00 UTC"),
    to_time: datetime = Query(..., alias="to", description="Exclusive delivery range end at 00:00 UTC"),
):
    start = _require_aware_utc(from_time, "from")
    end = _require_aware_utc(to_time, "to")
    _validate_hourly_window(start, end)

    if start.time() != time(0, 0) or end.time() != time(0, 0):
        raise HTTPException(
            status_code=422,
            detail="For rolling day-ahead analysis, 'from' and 'to' must both be midnight UTC boundaries.",
        )
    if end - start > timedelta(days=60):
        raise HTTPException(status_code=422, detail="Choose a range of 60 days or less.")

    first_cutoff = datetime.combine(start.date() - timedelta(days=1), time(12, 0), tzinfo=timezone.utc)
    last_delivery_day = (end - timedelta(microseconds=1)).date()
    last_cutoff = datetime.combine(last_delivery_day - timedelta(days=1), time(12, 0), tzinfo=timezone.utc)
    publication_from = first_cutoff - timedelta(days=3)

    try:
        actuals, forecasts = await asyncio.gather(
            get_actual_wind_generation(start, end),
            get_wind_forecasts(publication_from, last_cutoff),
        )
        result = calculate_rolling_day_ahead_accuracy(
            forecasts, actuals, start, end, cutoff_hour_utc=12
        )
        result.update({
            "actual_records_retrieved": len(actuals),
            "forecast_records_retrieved": len(forecasts),
            "forecast_publication_window": {
                "from": iso_utc(publication_from),
                "to": iso_utc(last_cutoff),
            },
        })
        return result
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Rolling accuracy calculation could not complete: {exc}") from exc
