"""
Practice session logging - the write path that drives every statistic.

Order of operations inside one transaction (this is the "event-driven pipeline"
made explicit, and it is why a failure can never leave inconsistent totals):

    1. insert the immutable session row
    2. increment the skill's denormalised counters
    3. fire the streak/bucket event  -> user_stats
    4. advance affected goals + reconcile milestones
    5. award newly earned badges
    6. optionally fan out to the community feed

If any step raises, the whole transaction rolls back: there is no state in which
a session exists but the totals do not.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import PracticeSession, Skill, User
from app.schemas import PracticeCreate, PracticeUpdate
from app.services import goal_service, stats_service
from app.services.skill_service import level_for_minutes, owned_skill
from app.utils.errors import NotFoundError, ValidationError
from app.utils.helpers import as_utc, compute_streak


def owned_session(db: Session, session_id: str, user: User) -> PracticeSession:
    record = db.get(PracticeSession, session_id)
    if record is None:
        raise NotFoundError("Practice session not found.", code="session_not_found")
    if record.user_id != user.id:
        raise NotFoundError("Practice session not found.", code="session_not_found")
    return record


def _resolve_timestamp(value: datetime | None) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    if value > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise ValidationError("Practice date cannot be in the future.", code="future_session")
    return value.astimezone(timezone.utc)


def create_session(db: Session, user: User, payload: PracticeCreate) -> dict[str, Any]:
    skill = owned_skill(db, payload.skill_id, user)
    practiced_at = _resolve_timestamp(payload.practiced_at)
    practiced_on = practiced_at.date()

    session = PracticeSession(
        user_id=user.id,
        skill_id=skill.id,
        duration_minutes=payload.duration_minutes,
        activity=payload.activity.strip(),
        notes=payload.notes.strip(),
        media_url=payload.media_url,
        mood=payload.mood,
        practiced_at=practiced_at,
    )
    db.add(session)

    # 2. denormalised skill counters
    skill.total_minutes += payload.duration_minutes
    skill.session_count += 1
    skill.current_level = level_for_minutes(skill.total_minutes, skill.current_level)
    if skill.current_level == skill.target_level and skill.status == "ACTIVE":
        skill.status = "COMPLETED"

    # 3. event-driven stats update
    stats_service.apply_practice_event(db, user.id, practiced_on, payload.duration_minutes)

    # 4. goals + milestones
    progress = goal_service.apply_practice(
        db, user, skill.id, payload.duration_minutes, practiced_on
    )

    db.flush()
    db.commit()
    db.refresh(session)

    result: dict[str, Any] = {
        "session": serialise_session(db, session),
        "progress_updates": progress["updates"],
        "goals_completed": progress["completed"],
    }

    # 5. badges
    stats = stats_service.get_or_create_stats(db, user.id)
    previous = list(stats.badges or [])
    earned = stats_service.evaluate_badges(stats, stats.goals_completed, stats.posts_count)
    newly = stats_service.new_badges(previous, earned)
    stats.badges = earned
    db.commit()
    result["new_badges"] = [
        {"code": code, **_badge_meta(code)} for code in newly
    ]
    result["stats"] = serialise_stats(stats)

    # 6. optional fan-out to the community feed
    if payload.share_to_feed:
        from app.services.post_service import create_post

        share_text = payload.activity.strip() or f"Logged {payload.duration_minutes} minutes"
        post = create_post(
            db,
            user,
            content=(
                f"{share_text} - {payload.duration_minutes} min on {skill.title}."
                + (f"\n\n{payload.notes.strip()}" if payload.notes.strip() else "")
            ),
            skill_id=skill.id,
            media_url=payload.media_url,
        )
        result["post"] = post
    return result


def _badge_meta(code: str) -> dict[str, str]:
    for definition in stats_service.BADGE_CATALOGUE:
        if definition["code"] == code:
            return {
                "title": definition["title"],
                "icon": definition["icon"],
                "description": definition["description"],
            }
    return {"title": code, "icon": "🏅", "description": ""}


def update_session(
    db: Session, user: User, session_id: str, payload: PracticeUpdate
) -> PracticeSession:
    record = owned_session(db, session_id, user)
    data = payload.model_dump(exclude_unset=True)
    previous_minutes = record.duration_minutes
    previous_day = as_utc(record.practiced_at).date()

    for field, value in data.items():
        if value is not None:
            setattr(record, field, value)

    skill = db.get(Skill, record.skill_id)
    delta = record.duration_minutes - previous_minutes
    if skill:
        skill.total_minutes = max(0, skill.total_minutes + delta)
        skill.current_level = level_for_minutes(skill.total_minutes, skill.current_level)

    # Re-apply the delta to goals and rebuild stats from the immutable log so
    # every derived number stays consistent.
    goal_service.reverse_practice(db, user, record.skill_id, previous_minutes)
    goal_service.apply_practice(
        db, user, record.skill_id, record.duration_minutes, as_utc(record.practiced_at).date()
    )
    stats_service.recompute_stats(db, user.id)
    db.commit()
    db.refresh(record)
    return record


def delete_session(db: Session, user: User, session_id: str) -> None:
    record = owned_session(db, session_id, user)
    skill = db.get(Skill, record.skill_id)
    if skill:
        skill.total_minutes = max(0, skill.total_minutes - record.duration_minutes)
        skill.session_count = max(0, skill.session_count - 1)
    goal_service.reverse_practice(db, user, record.skill_id, record.duration_minutes)
    db.delete(record)
    db.flush()
    stats_service.recompute_stats(db, user.id)
    db.commit()


def list_sessions(
    db: Session,
    user: User,
    skill_id: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[PracticeSession], int]:
    statement = select(PracticeSession).where(PracticeSession.user_id == user.id)
    if skill_id:
        statement = statement.where(PracticeSession.skill_id == skill_id)
    if since:
        statement = statement.where(PracticeSession.practiced_at >= since)
    if until:
        statement = statement.where(PracticeSession.practiced_at <= until)
    if search:
        pattern = f"%{search.strip()}%"
        statement = statement.where(
            func.lower(PracticeSession.activity).like(pattern)
            | func.lower(PracticeSession.notes).like(pattern)
        )
    total = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    rows = list(
        db.scalars(
            statement.order_by(PracticeSession.practiced_at.desc()).limit(limit).offset(offset)
        ).all()
    )
    return rows, int(total)


def serialise_session(db: Session, record: PracticeSession) -> dict[str, Any]:
    skill = db.get(Skill, record.skill_id)
    return {
        "id": record.id,
        "user_id": record.user_id,
        "skill_id": record.skill_id,
        "duration_minutes": record.duration_minutes,
        "activity": record.activity,
        "notes": record.notes,
        "media_url": record.media_url,
        "mood": record.mood,
        "practiced_at": record.practiced_at,
        "created_at": record.created_at,
        "skill_title": skill.title if skill else "",
        "skill_icon": skill.icon if skill else "",
        "skill_accent": skill.accent if skill else "violet",
    }


def serialise_stats(stats) -> dict[str, Any]:
    return {
        "total_minutes": stats.total_minutes,
        "total_sessions": stats.total_sessions,
        "current_streak": stats.current_streak,
        "longest_streak": stats.longest_streak,
        "last_log_date": stats.last_log_date,
        "active_days": stats.active_days,
        "goals_completed": stats.goals_completed,
        "milestones_achieved": stats.milestones_achieved,
        "posts_count": stats.posts_count,
        "likes_received": stats.likes_received,
        "comments_received": stats.comments_received,
        "followers_count": stats.followers_count,
        "following_count": stats.following_count,
        "badges": list(stats.badges or []),
        "weekly_target_minutes": stats.weekly_target_minutes,
        "weekly_minutes": dict(stats.weekly_minutes or {}),
        "daily_minutes": dict(stats.daily_minutes or {}),
    }


def streak_detail(db: Session, user: User) -> dict[str, Any]:
    """Full streak detail used by the dashboard hero card."""
    rows = db.execute(
        select(PracticeSession.practiced_at).where(PracticeSession.user_id == user.id)
    ).scalars().all()
    days = [as_utc(row).date() for row in rows]
    current, longest = compute_streak(days)
    today = datetime.now(timezone.utc).date()
    stats = stats_service.get_or_create_stats(db, user.id)
    daily = dict(stats.daily_minutes or {})
    return {
        "current_streak": current,
        "longest_streak": longest,
        "active_days": len(set(days)),
        "practiced_today": today in set(days),
        "minutes_today": int(daily.get(today.isoformat(), 0)),
        "days": [
            {
                "date": day.isoformat(),
                "minutes": int(daily.get(day.isoformat(), 0)),
            }
            for day in (today - timedelta(days=offset) for offset in range(6, -1, -1))
        ],
    }
