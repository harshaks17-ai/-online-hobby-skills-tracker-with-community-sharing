"""Skills CRUD: /api/skills"""

from __future__ import annotations

from fastapi import APIRouter, Query, status

from app.middleware.auth import CurrentUser, DbSession, OptionalUser
from app.schemas import MessageResponse, SkillCreate, SkillUpdate
from app.services import analytics_service, skill_service
from app.utils.errors import NotFoundError

router = APIRouter(prefix="/skills", tags=["Skills"])


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create a hobby / skill")
def create_skill(payload: SkillCreate, user: CurrentUser, db: DbSession) -> dict:
    """201 + the created skill. 409 if a skill with the same title already exists."""
    skill = skill_service.create_skill(db, user, payload)
    return skill_service.serialise_skill(db, skill)


@router.get("", summary="List my skills")
def list_skills(
    status_filter: str | None = Query(default=None, alias="status"),
    category: str | None = None,
    search: str | None = None,
    user: CurrentUser = None,  # type: ignore[assignment]
    db: DbSession = None,  # type: ignore[assignment]
) -> dict:
    """Always scoped to the caller - there is no way to ask for another user's list."""
    skills = skill_service.list_skills(db, user, status_filter, category, search)
    total_minutes = sum(skill.total_minutes for skill in skills)
    return {
        "items": [skill_service.serialise_skill(db, skill) for skill in skills],
        "total": len(skills),
        "total_minutes": total_minutes,
        "total_hours": round(total_minutes / 60, 1),
        "active": sum(1 for skill in skills if skill.status == "ACTIVE"),
    }


@router.get("/categories", summary="Supported skill categories")
def categories() -> dict:
    from app.schemas.dto import CATEGORIES

    return {"items": sorted(CATEGORIES)}


@router.get("/discover", summary="Popular public skills across the community")
def discover(
    search: str | None = None,
    category: str | None = None,
    limit: int = Query(default=24, ge=1, le=60),
    db: DbSession = None,  # type: ignore[assignment]
) -> dict:
    return {"items": analytics_service.skill_directory(db, search, category, limit)}


@router.get("/{skill_id}", summary="Skill details")
def get_skill(
    skill_id: str, user: CurrentUser = None, db: DbSession = None  # type: ignore[assignment]
) -> dict:
    """The owner always sees their own skill; other users only see public ones."""
    skill = skill_service.public_skill(db, skill_id, user)
    from sqlalchemy import select

    from app.models import Goal
    from app.services.goal_service import serialise_goal
    from app.services.practice_service import list_sessions, serialise_session

    sessions, total_sessions = list_sessions(db, user, skill_id=skill_id, limit=25)
    goals = list(
        db.scalars(select(Goal).where(Goal.skill_id == skill.id, Goal.user_id == skill.user_id)).all()
    )
    return {
        "skill": skill_service.serialise_skill(db, skill),
        "sessions": [serialise_session(db, row) for row in sessions],
        "total_sessions": total_sessions,
        "goals": [serialise_goal(db, goal) for goal in goals],
    }


@router.put("/{skill_id}", summary="Update a skill I own")
def update_skill(
    skill_id: str, payload: SkillUpdate, user: CurrentUser, db: DbSession
) -> dict:
    """403 `not_skill_owner` if the skill belongs to somebody else."""
    skill = skill_service.update_skill(db, user, skill_id, payload)
    return skill_service.serialise_skill(db, skill)


@router.delete("/{skill_id}", response_model=MessageResponse, summary="Delete a skill I own")
def delete_skill(skill_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    skill_service.delete_skill(db, user, skill_id)
    return MessageResponse(
        message="Skill deleted along with its sessions and goals.",
        data={"id": skill_id},
    )
