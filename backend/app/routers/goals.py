"""Goals & milestones: /api/goals"""

from __future__ import annotations

from fastapi import APIRouter, Query, status

from app.middleware.auth import CurrentUser, DbSession
from app.schemas import GoalCreate, GoalUpdate, MessageResponse
from app.services import goal_service
from app.utils.errors import NotFoundError

router = APIRouter(prefix="/goals", tags=["Goals"])


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create a goal")
def create_goal(payload: GoalCreate, user: CurrentUser, db: DbSession) -> dict:
    """
    201 + the goal with auto-generated milestones (25/50/75/100%) unless the
    caller supplied their own.
    """
    goal = goal_service.create_goal(db, user, payload)
    return goal_service.serialise_goal(db, goal)


@router.get("", summary="List my goals")
def list_goals(
    status_filter: str | None = Query(default=None, alias="status"),
    skill_id: str | None = None,
    user: CurrentUser = None,  # type: ignore[assignment]
    db: DbSession = None,  # type: ignore[assignment]
) -> dict:
    goals = goal_service.list_goals(db, user, status_filter, skill_id)
    return {
        "items": [goal_service.serialise_goal(db, goal) for goal in goals],
        "summary": goal_service.goals_summary(goals),
    }


@router.get("/achievements", summary="Milestones I have achieved")
def achievements(user: CurrentUser, db: DbSession) -> dict:
    return {"items": goal_service.achievement_feed(db, user, limit=30)}


@router.get("/{goal_id}", summary="Goal details")
def get_goal(goal_id: str, user: CurrentUser, db: DbSession) -> dict:
    goal = goal_service.owned_goal(db, goal_id, user)
    return goal_service.serialise_goal(db, goal)


@router.put("/{goal_id}", summary="Update a goal")
def update_goal(goal_id: str, payload: GoalUpdate, user: CurrentUser, db: DbSession) -> dict:
    goal = goal_service.update_goal(db, user, goal_id, payload)
    return goal_service.serialise_goal(db, goal)


@router.post("/{goal_id}/rebuild", summary="Re-derive progress from the session log")
def rebuild(goal_id: str, user: CurrentUser, db: DbSession) -> dict:
    """
    Self-heal endpoint: recomputes `current_value` from the immutable
    `practice_sessions` table. In production this is a nightly scheduled job.
    """
    goal = goal_service.owned_goal(db, goal_id, user)
    goal_service.rebuild_goal_progress(db, user, goal)
    db.commit()
    db.refresh(goal)
    return goal_service.serialise_goal(db, goal)


@router.delete("/{goal_id}", response_model=MessageResponse, summary="Delete a goal")
def delete_goal(goal_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    goal_service.delete_goal(db, user, goal_id)
    return MessageResponse(message="Goal deleted.", data={"id": goal_id})
