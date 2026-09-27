"""Skill (hobby) management: create / read / update / delete with ownership checks."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Goal, PracticeSession, Skill, User
from app.schemas import SkillCreate, SkillUpdate
from app.utils.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.utils.helpers import progress_percent


def owned_skill(db: Session, skill_id: str, user: User) -> Skill:
    """
    Fetch a skill and enforce that the caller owns it.

    This single helper is the backbone of the authorization model: a non-owner
    receives 404-style "not found" for private data, and 403 when the record
    exists but the action is not permitted. No route ever queries a Skill by id
    without going through here.
    """
    skill = db.get(Skill, skill_id)
    if skill is None:
        raise NotFoundError("Skill not found.", code="skill_not_found")
    if skill.user_id != user.id:
        raise ForbiddenError("You can only modify your own skills.", code="not_skill_owner")
    return skill


def public_skill(db: Session, skill_id: str, viewer: User | None) -> Skill:
    skill = db.get(Skill, skill_id)
    if skill is None:
        raise NotFoundError("Skill not found.", code="skill_not_found")
    if not skill.is_public and (viewer is None or viewer.id != skill.user_id):
        raise ForbiddenError("This skill is private.", code="skill_private")
    return skill


def create_skill(db: Session, user: User, payload: SkillCreate) -> Skill:
    existing = db.scalar(
        select(Skill).where(
            Skill.user_id == user.id, func.lower(Skill.title) == payload.title.strip().lower()
        )
    )
    if existing:
        raise ConflictError("You already track a skill with that name.", code="skill_exists")

    skill = Skill(
        user_id=user.id,
        title=payload.title.strip(),
        category=payload.category,
        description=payload.description.strip(),
        icon=payload.icon,
        accent=payload.accent,
        current_level=payload.current_level,
        target_level=payload.target_level,
        goal_per_week=payload.goal_per_week,
        minutes_per_session=payload.minutes_per_session,
        target_date=payload.target_date,
        start_date=datetime.now(timezone.utc).date(),
        status="ACTIVE",
    )
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return skill


def update_skill(db: Session, user: User, skill_id: str, payload: SkillUpdate) -> Skill:
    skill = owned_skill(db, skill_id, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(skill, field, value)
    if skill.status == "COMPLETED":
        skill.current_level = skill.target_level
    db.commit()
    db.refresh(skill)
    return skill


def delete_skill(db: Session, user: User, skill_id: str) -> None:
    skill = owned_skill(db, skill_id, user)
    db.delete(skill)          # cascades -> sessions, goals, milestones
    db.commit()


def list_skills(
    db: Session,
    user: User,
    status: str | None = None,
    category: str | None = None,
    search: str | None = None,
) -> list[Skill]:
    statement = select(Skill).where(Skill.user_id == user.id)
    if status:
        statement = statement.where(Skill.status == status.upper())
    if category:
        statement = statement.where(Skill.category == category.lower())
    if search:
        pattern = f"%{search.strip()}%"
        statement = statement.where(
            func.lower(Skill.title).like(pattern) | func.lower(Skill.description).like(pattern)
        )
    return list(db.scalars(statement.order_by(Skill.created_at.desc())).all())


def weekly_minutes_for(db: Session, skill_id: str) -> int:
    """Minutes logged for this skill in the current ISO week."""
    from app.utils.helpers import as_utc, iso_week_key

    week_key = iso_week_key(datetime.now(timezone.utc).date())
    rows = db.execute(
        select(PracticeSession.practiced_at, PracticeSession.duration_minutes).where(
            PracticeSession.skill_id == skill_id
        )
    ).all()
    total = 0
    for practiced_at, minutes in rows:
        if iso_week_key(as_utc(practiced_at).date()) == week_key:
            total += int(minutes or 0)
    return total


def skill_streak(db: Session, skill_id: str) -> tuple[int, int]:
    from app.utils.helpers import as_utc, compute_streak

    rows = db.execute(
        select(PracticeSession.practiced_at).where(PracticeSession.skill_id == skill_id)
    ).scalars().all()
    return compute_streak([as_utc(row).date() for row in rows])


def serialise_skill(db: Session, skill: Skill) -> dict[str, Any]:
    goal_count = db.scalar(
        select(func.count(Goal.id)).where(Goal.skill_id == skill.id)
    ) or 0
    last_practiced = db.scalar(
        select(func.max(PracticeSession.practiced_at)).where(PracticeSession.skill_id == skill.id)
    )
    current_streak, _ = skill_streak(db, skill.id)
    weekly = weekly_minutes_for(db, skill.id)
    target_week = max(skill.goal_per_week, 1)
    return {
        "id": skill.id,
        "user_id": skill.user_id,
        "title": skill.title,
        "category": skill.category,
        "description": skill.description,
        "icon": skill.icon,
        "accent": skill.accent,
        "current_level": skill.current_level,
        "target_level": skill.target_level,
        "status": skill.status,
        "goal_per_week": skill.goal_per_week,
        "minutes_per_session": skill.minutes_per_session,
        "start_date": skill.start_date,
        "target_date": skill.target_date,
        "total_minutes": skill.total_minutes,
        "session_count": skill.session_count,
        "is_public": skill.is_public,
        "created_at": skill.created_at,
        "progress_percent": progress_percent(weekly, target_week),
        "weekly_minutes": weekly,
        "weekly_target": target_week,
        "current_streak": current_streak,
        "last_practiced_at": last_practiced,
        "goal_count": int(goal_count),
    }


def level_for_minutes(minutes: int, fallback: str) -> str:
    """Promote (never demote) a level based on accumulated practice time."""
    from app.services.stats_service import skill_level_for

    return skill_level_for(minutes, fallback)


def suggest_deadline(weeks: int = 12) -> str:
    return (datetime.now(timezone.utc).date() + timedelta(weeks=weeks)).isoformat()


def validate_target_date(target_date) -> None:
    if target_date and target_date < datetime.now(timezone.utc).date():
        raise ValidationError("Target date cannot be in the past.", code="invalid_target_date")
