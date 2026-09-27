"""Practice logging: /api/practice"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query, status

from app.middleware.auth import CurrentUser, DbSession
from app.schemas import MessageResponse, PracticeCreate, PracticeUpdate
from app.services import practice_service
from app.utils.errors import NotFoundError

router = APIRouter(prefix="/practice", tags=["Practice"])


@router.post("", status_code=status.HTTP_201_CREATED, summary="Log a practice session")
def log_practice(payload: PracticeCreate, user: CurrentUser, db: DbSession) -> dict:
    """
    The single write that drives the whole product.

    Returns the created session **plus** everything that changed as a result:
    goal progress, newly completed goals, newly earned badges and the refreshed
    stats. One round-trip, no client-side recomputation, no drift.
    """
    result = practice_service.create_session(db, user, payload)
    return result


@router.get("", summary="My practice history")
def list_practice(
    skill_id: str | None = None,
    days: int | None = Query(default=None, ge=1, le=365),
    search: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: CurrentUser = None,  # type: ignore[assignment]
    db: DbSession = None,  # type: ignore[assignment]
) -> dict:
    since = (
        datetime.now(timezone.utc) - timedelta(days=days) if days else None
    )
    rows, total = practice_service.list_sessions(
        db, user, skill_id=skill_id, since=since, search=search, limit=limit, offset=offset
    )
    return {
        "items": [practice_service.serialise_session(db, row) for row in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
        "total_minutes": sum(int(row.duration_minutes or 0) for row in rows),
    }


@router.get("/streak", summary="Streak detail for the dashboard hero")
def streak(user: CurrentUser, db: DbSession) -> dict:
    return practice_service.streak_detail(db, user)


@router.get("/{session_id}", summary="One practice session")
def get_session(session_id: str, user: CurrentUser, db: DbSession) -> dict:
    record = practice_service.owned_session(db, session_id, user)
    return practice_service.serialise_session(db, record)


@router.put("/{session_id}", summary="Edit a session")
def update_session(
    session_id: str, payload: PracticeUpdate, user: CurrentUser, db: DbSession
) -> dict:
    """Totals, streaks and goal progress are all re-derived after the edit."""
    record = practice_service.update_session(db, user, session_id, payload)
    return practice_service.serialise_session(db, record)


@router.delete("/{session_id}", response_model=MessageResponse, summary="Delete a session")
def delete_session(session_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    practice_service.delete_session(db, user, session_id)
    return MessageResponse(message="Practice session removed.", data={"id": session_id})


@router.get("/by-skill/{skill_id}", summary="History for one skill")
def by_skill(
    skill_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    user: CurrentUser = None,  # type: ignore[assignment]
    db: DbSession = None,  # type: ignore[assignment]
) -> dict:
    from app.services.skill_service import owned_skill

    skill_service_owned = owned_skill(db, skill_id, user)
    rows, total = practice_service.list_sessions(db, user, skill_id=skill_service_owned.id, limit=limit)
    return {
        "items": [practice_service.serialise_session(db, row) for row in rows],
        "total": total,
    }
