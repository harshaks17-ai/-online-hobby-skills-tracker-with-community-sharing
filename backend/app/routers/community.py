"""Public/community endpoints + moderation."""

from __future__ import annotations

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app.middleware.auth import CurrentUser, DbSession
from app.schemas import MessageResponse, ReportCreate
from app.services import analytics_service, post_service

router = APIRouter(prefix="/community", tags=["Community"])


@router.get("/stats", summary="Public platform counters (landing page)")
def platform_stats(db: DbSession) -> dict:
    return analytics_service.platform_health(db)


@router.get("/trending", summary="Trending posts")
def trending(
    limit: int = Query(default=8, ge=1, le=30), db: DbSession = None  # type: ignore[assignment]
) -> dict:
    return {"items": post_service.trending(db, limit=limit)}


@router.get("/trending-skills", summary="Most practised skills in the community")
def trending_skills(db: DbSession) -> dict:
    return {"items": post_service.trending_skills(db, limit=10)}


@router.get("/categories", summary="Community totals per category")
def categories(db: DbSession) -> dict:
    return {"items": analytics_service.category_breakdown(db)}


@router.get("/activity", summary="Community-wide daily session counts")
def activity(db: DbSession) -> dict:
    return {"items": analytics_service.platform_daily_activity(db, days=21)}


@router.get("/directory", summary="Search every public skill on the platform")
def directory(
    search: str | None = None,
    category: str | None = None,
    limit: int = Query(default=24, ge=1, le=60),
    db: DbSession = None,  # type: ignore[assignment]
) -> dict:
    return {"items": analytics_service.skill_directory(db, search, category, limit)}


@router.post("/reports", status_code=status.HTTP_201_CREATED, response_model=MessageResponse,
             summary="Report content (moderation entry point)")
def report(payload: ReportCreate, user: CurrentUser, db: DbSession) -> MessageResponse:
    """
    User-generated content is untrusted input, so every user gets a way to flag
    it. Reports land in a moderation queue that only the Moderator role can read.
    """
    from app.models import Report

    record = Report(
        reporter_id=user.id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        reason=payload.reason,
        details=payload.details,
    )
    db.add(record)
    db.commit()
    return MessageResponse(
        message="Thanks - our moderators will review this.",
        data={"report_id": record.id},
    )


@router.get("/reports", summary="Moderation queue (Moderator role only)")
def moderation_queue(
    limit: int = Query(default=50, ge=1, le=200),
    user: CurrentUser = None,  # type: ignore[assignment]
    db: DbSession = None,  # type: ignore[assignment]
) -> dict:
    """Only the Moderator role can read the queue - 403 otherwise."""
    if not user.is_moderator:
        from app.utils.errors import ForbiddenError

        raise ForbiddenError("Moderator privileges are required.", code="moderator_required")

    from app.models import Report

    rows = list(
        db.scalars(select(Report).order_by(Report.created_at.desc()).limit(limit)).all()
    )
    return {
        "items": [
            {
                "id": row.id,
                "reporter_id": row.reporter_id,
                "target_type": row.target_type,
                "target_id": row.target_id,
                "reason": row.reason,
                "details": row.details,
                "status": row.status,
                "created_at": row.created_at,
            }
            for row in rows
        ]
    }
