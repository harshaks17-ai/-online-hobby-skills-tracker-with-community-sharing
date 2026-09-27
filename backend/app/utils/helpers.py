"""Pure business rules - deliberately dependency-free so they are trivially unit-testable."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Sequence


def as_utc(value: datetime) -> datetime:
    """SQLite drops tzinfo; re-attach UTC so arithmetic never raises."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def to_date(value: datetime | date | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return as_utc(value).date()
    return value


# ------------------------------------------------------------------ progress
def progress_percent(current: float, target: float) -> float:
    """Progress % = (current / target) * 100, capped at 100 and never negative."""
    if not target or target <= 0:
        return 0.0
    pct = (float(current) / float(target)) * 100.0
    return round(max(0.0, min(100.0, pct)), 1)


def minutes_to_hours(minutes: float) -> float:
    return round(float(minutes) / 60.0, 1)


def humanise_minutes(minutes: float) -> str:
    minutes = int(minutes or 0)
    hours, mins = divmod(minutes, 60)
    if hours and mins:
        return f"{hours}h {mins}m"
    if hours:
        return f"{hours}h"
    return f"{mins}m"


# ------------------------------------------------------------------- streaks
def compute_streak(
    practice_dates: Sequence[date], today: date | None = None
) -> tuple[int, int]:
    """
    Return `(current_streak, longest_streak)` from the full day history.

    Rules
    -----
    * Only distinct calendar days count - three sessions in one day is a streak
      of 1, not 3.
    * The current streak survives "today has not been logged yet": if the most
      recent log was *yesterday* the streak is still alive, it just has not been
      extended yet. A gap of 2+ days resets it to 0.
    * `longest_streak` is the longest run of consecutive days anywhere in
      history and never decreases.
    """
    today = today or datetime.now(timezone.utc).date()
    unique_days = sorted({d for d in practice_dates if d is not None})
    if not unique_days:
        return 0, 0

    longest, run = 1, 1
    for previous, current in zip(unique_days, unique_days[1:]):
        run = run + 1 if (current - previous).days == 1 else 1
        longest = max(longest, run)

    if (today - unique_days[-1]).days > 1:
        return 0, longest

    return _walk_back(unique_days), longest


def _walk_back(unique_days: Sequence[date]) -> int:
    """Length of the consecutive run that ends on the most recent practice day."""
    streak = 1
    for index in range(len(unique_days) - 1, 0, -1):
        if (unique_days[index] - unique_days[index - 1]).days == 1:
            streak += 1
        else:
            break
    return streak


def next_streak(
    previous_streak: int, last_log_date: date | None, practiced_on: date
) -> int:
    """
    Incremental streak update - the exact algorithm used by the event-driven
    `onPracticeCreate` trigger (services/stats_service.py), so a newly logged
    session never has to rescan the whole history.

    * first ever log              -> 1
    * a second log on the same day-> unchanged (a day counts once)
    * the day after the last log  -> previous + 1
    * any larger gap              -> reset to 1
    """
    if last_log_date is None:
        return 1
    if practiced_on == last_log_date:
        return max(previous_streak, 1)
    if (practiced_on - last_log_date).days == 1:
        return max(previous_streak, 0) + 1
    return 1


# ------------------------------------------------------------------- buckets
def iso_week_key(day: date) -> str:
    year, week, _ = day.isocalendar()
    return f"{year}-W{week:02d}"


def bucket_minutes_by_week(days: Iterable[date]) -> dict[str, int]:
    """Count *sessions* per ISO week - the raw material for the trend chart."""
    buckets: dict[str, int] = {}
    for day in days:
        key = iso_week_key(day)
        buckets[key] = buckets.get(key, 0) + 1
    return buckets


def last_n_weeks(n: int, today: date | None = None) -> list[str]:
    """Ordered ISO week keys for the trailing `n` weeks, oldest first."""
    today = today or datetime.now(timezone.utc).date()
    monday = today - timedelta(days=today.weekday())
    keys: list[str] = []
    for offset in range(n - 1, -1, -1):
        keys.append(iso_week_key(monday - timedelta(weeks=offset)))
    return keys


def last_n_days(n: int, today: date | None = None) -> list[date]:
    today = today or datetime.now(timezone.utc).date()
    return [today - timedelta(days=offset) for offset in range(n - 1, -1, -1)]


def level_from_minutes(minutes: float) -> str:
    hours = minutes / 60.0
    if hours >= 40:
        return "ADVANCED"
    if hours >= 10:
        return "INTERMEDIATE"
    return "BEGINNER"


def level_rank(level: str) -> int:
    return {"BEGINNER": 0, "INTERMEDIATE": 1, "ADVANCED": 2}.get((level or "").upper(), 0)


def slugify(value: str) -> str:
    return "".join(ch if ch.isalnum() else "-" for ch in value.lower()).strip("-")
