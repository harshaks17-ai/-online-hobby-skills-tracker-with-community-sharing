"""
Stats service - the event-driven "Cloud Function" analogue.

In the managed architecture this logic lives in a Firestore trigger
(`onPracticeCreate`) or a scheduled job that recomputes a user's roll-up
document. Locally it is a plain service function invoked inside the same
transaction, which keeps the *behaviour* identical while removing the need for
an emulator.

Guarantee: the roll-up is always derivable from `practice_sessions`.
`recompute_stats()` is the single source of truth and is idempotent, so a
retry, a replayed event or a manual backfill can never corrupt it.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Badge,
    Goal,
    Like,
    Milestone,
    Post,
    PracticeSession,
    UserStats,
)
from app.utils.helpers import (
    as_utc,
    compute_streak,
    iso_week_key,
    level_from_minutes,
    next_streak,
)

# The badge catalogue. `threshold` is interpreted against `metric`.
BADGE_CATALOGUE: list[dict] = [
    {"code": "first_log", "title": "First Steps", "description": "Logged your very first practice session",
     "icon": "🌱", "tier": "bronze", "threshold": 1, "metric": "sessions"},
    {"code": "streak_3", "title": "Warming Up", "description": "3-day practice streak",
     "icon": "🔥", "tier": "bronze", "threshold": 3, "metric": "streak"},
    {"code": "streak_7", "title": "Week Warrior", "description": "7-day practice streak",
     "icon": "⚡", "tier": "silver", "threshold": 7, "metric": "streak"},
    {"code": "streak_30", "title": "Unstoppable", "description": "30-day practice streak",
     "icon": "💎", "tier": "gold", "threshold": 30, "metric": "streak"},
    {"code": "minutes_600", "title": "Ten Hour Club", "description": "600 minutes of total practice",
     "icon": "⏱️", "tier": "bronze", "threshold": 600, "metric": "minutes"},
    {"code": "minutes_3000", "title": "Fifty Hour Club", "description": "3,000 minutes of total practice",
     "icon": "🏆", "tier": "gold", "threshold": 3000, "metric": "minutes"},
    {"code": "goals_1", "title": "Goal Getter", "description": "Completed your first goal",
     "icon": "🎯", "tier": "silver", "threshold": 1, "metric": "goals"},
    {"code": "goals_5", "title": "Goal Machine", "description": "Completed five goals",
     "icon": "🏅", "tier": "gold", "threshold": 5, "metric": "goals"},
    {"code": "social_5", "title": "Community Voice", "description": "Shared 5 updates with the community",
     "icon": "💬", "tier": "bronze", "threshold": 5, "metric": "posts"},
    {"code": "social_25", "title": "Creator", "description": "Shared 25 updates with the community",
     "icon": "📣", "tier": "gold", "threshold": 25, "metric": "posts"},
]


def get_or_create_stats(db: Session, user_id: str) -> UserStats:
    stats = db.get(UserStats, user_id)
    if stats is None:
        stats = UserStats(user_id=user_id, weekly_minutes={}, daily_minutes={}, badges=[])
        db.add(stats)
        db.flush()
    return stats


def sync_badge_catalogue(db: Session) -> None:
    """Upsert the badge definitions (idempotent, run on startup)."""
    existing = {b.code for b in db.scalars(select(Badge)).all()}
    for definition in BADGE_CATALOGUE:
        if definition["code"] in existing:
            continue
        # `metric` is evaluation metadata, not a column.
        db.add(
            Badge(
                code=definition["code"],
                title=definition["title"],
                description=definition["description"],
                icon=definition["icon"],
                tier=definition["tier"],
                threshold=definition["threshold"],
            )
        )
    db.flush()


def evaluate_badges(stats: UserStats, goals_completed: int, posts_count: int) -> list[str]:
    """Return the sorted list of badge codes the user has earned."""
    metrics = {
        "sessions": stats.total_sessions,
        "minutes": stats.total_minutes,
        "streak": max(stats.current_streak, stats.longest_streak),
        "goals": goals_completed,
        "posts": posts_count,
    }
    earned = [
        definition["code"]
        for definition in BADGE_CATALOGUE
        if metrics.get(definition["metric"], 0) >= definition["threshold"]
    ]
    return sorted(earned)


def new_badges(previous: list[str], earned: list[str]) -> list[str]:
    """Diff helper so the API can report "you just earned X"."""
    return [code for code in earned if code not in set(previous or [])]


def apply_practice_event(
    db: Session, user_id: str, practiced_on: date, minutes: int
) -> UserStats:
    """
    Incremental streak/bucket update - the exact body of the production
    Firestore trigger. Used on the hot path; `recompute_stats` re-derives
    everything from source of truth for verification.
    """
    stats = get_or_create_stats(db, user_id)
    stats.total_minutes += minutes
    stats.total_sessions += 1
    stats.current_streak = next_streak(
        stats.current_streak, stats.last_log_date, practiced_on
    )
    stats.longest_streak = max(stats.longest_streak, stats.current_streak)
    if stats.last_log_date is None or practiced_on > stats.last_log_date:
        stats.last_log_date = practiced_on
        stats.active_days += 1

    week_key = iso_week_key(practiced_on)
    weekly = dict(stats.weekly_minutes or {})
    weekly[week_key] = weekly.get(week_key, 0) + minutes
    stats.weekly_minutes = weekly

    daily = dict(stats.daily_minutes or {})
    daily[practiced_on.isoformat()] = daily.get(practiced_on.isoformat(), 0) + minutes
    stats.daily_minutes = daily
    return stats


def recompute_stats(db: Session, user_id: str) -> UserStats:
    """
    Rebuild the roll-up from `practice_sessions` + social counters.
    Idempotent, so it doubles as the nightly scheduled-job body and as a
    self-heal for a retried event.
    """
    from app.models import Comment, Follow, Skill

    stats = get_or_create_stats(db, user_id)

    sessions = list(
        db.scalars(select(PracticeSession).where(PracticeSession.user_id == user_id)).all()
    )

    day_of: dict[date, int] = {}
    weekly: dict[str, int] = {}
    daily: dict[str, int] = {}
    total = 0
    for session in sessions:
        day = as_utc(session.practiced_at).date()
        minutes = int(session.duration_minutes or 0)
        total += minutes
        day_of[day] = day_of.get(day, 0) + 1
        week_key = iso_week_key(day)
        weekly[week_key] = weekly.get(week_key, 0) + minutes
        daily[day.isoformat()] = daily.get(day.isoformat(), 0) + minutes

    today = datetime.now(timezone.utc).date()
    current_streak, longest_streak = compute_streak(list(day_of.keys()), today)

    stats.total_minutes = total
    stats.total_sessions = len(sessions)
    stats.current_streak = current_streak
    stats.longest_streak = longest_streak
    stats.last_log_date = max(day_of) if day_of else None
    stats.active_days = len(day_of)
    stats.weekly_minutes = weekly
    stats.daily_minutes = daily

    stats.goals_completed = int(
        db.scalar(
            select(func.count(Goal.id)).where(Goal.user_id == user_id, Goal.status == "COMPLETED")
        )
        or 0
    )
    stats.posts_count = int(
        db.scalar(select(func.count(Post.id)).where(Post.user_id == user_id)) or 0
    )
    stats.likes_received = int(
        db.scalar(
            select(func.count(Like.id))
            .join(Post, Post.id == Like.post_id)
            .where(Post.user_id == user_id)
        )
        or 0
    )
    stats.comments_received = int(
        db.scalar(
            select(func.count(Comment.id))
            .join(Post, Post.id == Comment.post_id)
            .where(Post.user_id == user_id)
        )
        or 0
    )
    stats.followers_count = int(
        db.scalar(select(func.count(Follow.id)).where(Follow.following_id == user_id)) or 0
    )
    stats.following_count = int(
        db.scalar(select(func.count(Follow.id)).where(Follow.follower_id == user_id)) or 0
    )
    stats.milestones_achieved = int(
        db.scalar(
            select(func.count(Milestone.id))
            .join(Goal, Goal.id == Milestone.goal_id)
            .where(Goal.user_id == user_id, Milestone.achieved.is_(True))
        )
        or 0
    )
    stats.weekly_target_minutes = int(
        db.scalar(
            select(func.coalesce(func.sum(Skill.goal_per_week), 0)).where(
                Skill.user_id == user_id, Skill.status == "ACTIVE"
            )
        )
        or 0
    )
    stats.badges = evaluate_badges(stats, stats.goals_completed, stats.posts_count)
    return stats


def refresh_social_stats(db: Session, user_id: str) -> None:
    """Cheap counter refresh used after like/comment/follow mutations."""
    from app.models import Comment, Follow

    stats = get_or_create_stats(db, user_id)
    stats.likes_received = int(
        db.scalar(
            select(func.count(Like.id))
            .join(Post, Post.id == Like.post_id)
            .where(Post.user_id == user_id)
        )
        or 0
    )
    stats.comments_received = int(
        db.scalar(
            select(func.count(Comment.id))
            .join(Post, Post.id == Comment.post_id)
            .where(Post.user_id == user_id)
        )
        or 0
    )
    stats.followers_count = int(
        db.scalar(select(func.count(Follow.id)).where(Follow.following_id == user_id)) or 0
    )
    stats.following_count = int(
        db.scalar(select(func.count(Follow.id)).where(Follow.follower_id == user_id)) or 0
    )
    stats.posts_count = int(
        db.scalar(select(func.count(Post.id)).where(Post.user_id == user_id)) or 0
    )
    stats.badges = evaluate_badges(stats, stats.goals_completed, stats.posts_count)


def weekly_total(stats: UserStats, today: date | None = None) -> int:
    today = today or datetime.now(timezone.utc).date()
    return int((stats.weekly_minutes or {}).get(iso_week_key(today), 0))


def skill_level_for(minutes: int, current: str) -> str:
    """Never let a level regress because of a derived recalculation."""
    from app.utils.helpers import level_rank

    derived = level_from_minutes(minutes)
    return derived if level_rank(derived) > level_rank(current) else current


def weekly_series(stats: UserStats, weeks: int = 8) -> list[dict]:
    """Ordered list of `{week, minutes}` for the trend chart (oldest first)."""
    from app.utils.helpers import last_n_weeks

    buckets = stats.weekly_minutes or {}
    return [
        {"week": key, "label": key.split("-W")[-1], "minutes": int(buckets.get(key, 0))}
        for key in last_n_weeks(weeks)
    ]


def day_series(stats: UserStats, days: int = 30) -> list[dict]:
    from app.utils.helpers import last_n_days

    buckets = stats.daily_minutes or {}
    return [
        {"date": day.isoformat(), "minutes": int(buckets.get(day.isoformat(), 0))}
        for day in last_n_days(days)
    ]


def heatmap(stats: UserStats, weeks: int = 26) -> list[dict]:
    """GitHub-style contribution grid payload (13 columns x 7 rows per week)."""
    from app.utils.helpers import last_n_days

    buckets = stats.daily_minutes or {}
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(weeks=weeks - 1)
    start = start - timedelta(days=start.weekday())
    grid: list[dict] = []
    day = start
    while day <= today:
        grid.append(
            {
                "date": day.isoformat(),
                "minutes": int(buckets.get(day.isoformat(), 0)),
                "future": day > today,
            }
        )
        day += timedelta(days=1)
    return grid


def is_streak_at_risk(stats: UserStats) -> bool:
    """True when the streak is alive but today has no session yet."""
    if not stats.last_log_date:
        return False
    today = datetime.now(timezone.utc).date()
    return stats.current_streak > 0 and (today - stats.last_log_date).days == 0
