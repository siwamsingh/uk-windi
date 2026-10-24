"""Small, validated client for the Elexon BMRS FUELHH and WINDFOR datasets."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import httpx

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
REQUEST_TIMEOUT_SECONDS = 45.0


def parse_utc(value: str | datetime) -> datetime:
    """Parse an API timestamp and return an aware UTC datetime.

    Elexon timestamps are UTC. If an upstream timestamp omits an offset,
    treat it as UTC rather than the machine's local timezone.
    """
    if isinstance(value, datetime):
        parsed = value
    else:
        if not value:
            raise ValueError("Timestamp is empty")
        parsed = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))

    if parsed.tzinfo is None or parsed.utcoffset() is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def iso_utc(value: datetime) -> str:
    """Serialize an aware datetime as ISO-8601 UTC ending in Z."""
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Datetime must include a timezone")
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _extract_records(payload: Any) -> list[dict[str, Any]]:
    """Handle Elexon endpoints that return either a list or {data: [...]} ."""
    if isinstance(payload, dict):
        records = payload.get("data", payload)
    else:
        records = payload

    if records is None:
        return []
    if not isinstance(records, list):
        raise ValueError("Elexon returned an unexpected JSON response shape")
    return [record for record in records if isinstance(record, dict)]


def _number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _revision_key(record: dict[str, Any]) -> tuple[datetime, int]:
    published = record.get("publishTime")
    try:
        published_at = parse_utc(published) if published else datetime.min.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        published_at = datetime.min.replace(tzinfo=timezone.utc)
    try:
        revision = int(record.get("documentRevisionNumber") or 0)
    except (TypeError, ValueError):
        revision = 0
    return published_at, revision


async def get_actual_wind_generation(
    from_time: datetime,
    to_time: datetime,
) -> list[dict[str, Any]]:
    """Get actual national WIND generation for [from_time, to_time).

    FUELHH filters by settlement date inclusively, so the exact timestamp
    range is also applied locally with an exclusive end boundary.
    """
    start = parse_utc(from_time)
    end = parse_utc(to_time)
    if start >= end:
        raise ValueError("Actuals start time must be earlier than end time")

    url = f"{BASE_URL}/datasets/FUELHH/stream"
    params = {
        "settlementDateFrom": start.date().isoformat(),
        "settlementDateTo": end.date().isoformat(),
        "fuelType": "WIND",
    }

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        records = _extract_records(response.json())

    latest_by_interval: dict[datetime, dict[str, Any]] = {}
    for record in records:
        fuel_type = record.get("fuelType")
        if fuel_type and str(fuel_type).upper() != "WIND":
            continue

        try:
            interval_start = parse_utc(record.get("startTime"))
        except (TypeError, ValueError):
            continue

        if not (start <= interval_start < end):
            continue

        existing = latest_by_interval.get(interval_start)
        if existing is None or _revision_key(record) >= _revision_key(existing):
            latest_by_interval[interval_start] = record

    return [latest_by_interval[key] for key in sorted(latest_by_interval)]


async def get_wind_forecasts(
    publish_from: datetime,
    publish_to: datetime,
) -> list[dict[str, Any]]:
    """Get WINDFOR records published within [publish_from, publish_to].

    These arguments are a PUBLICATION-time window, not the delivery-time
    window. A second local filter is deliberately applied to guard against
    unexpected upstream filtering and prevent look-ahead leakage.
    """
    start = parse_utc(publish_from)
    end = parse_utc(publish_to)
    if start > end:
        raise ValueError("Forecast publication start must not be after publication end")

    url = f"{BASE_URL}/datasets/WINDFOR/stream"
    params = {
        "publishDateTimeFrom": iso_utc(start),
        "publishDateTimeTo": iso_utc(end),
    }

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        records = _extract_records(response.json())

    filtered: list[dict[str, Any]] = []
    for record in records:
        try:
            published_at = parse_utc(record.get("publishTime"))
        except (TypeError, ValueError):
            # No publication timestamp means we cannot prove it was available
            # at decision time, so do not use it in an accuracy calculation.
            continue

        if start <= published_at <= end:
            filtered.append(record)

    return filtered
