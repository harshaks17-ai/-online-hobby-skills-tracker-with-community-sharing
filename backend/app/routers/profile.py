"""GET/PUT /api/profile - the caller's own profile."""

from __future__ import annotations

from fastapi import APIRouter

from app.middleware.auth import CurrentUser, DbSession
from app.schemas import MessageResponse, PasswordChange, ProfileUpdate
from app.services import auth_service
from app.services.practice_service import serialise_stats
from app.services.stats_service import get_or_create_stats, sync_badge_catalogue
from app.utils.errors import ValidationError

router = APIRouter(prefix="/profile", tags=["Profile"])


@router.get("", summary="Read my profile")
def get_profile(user: CurrentUser, db: DbSession) -> dict:
    stats = get_or_create_stats(db, user.id)
    return {
        "user": auth_service.serialise_user(user, include_private=True),
        "stats": serialise_stats(stats),
    }


@router.put("", summary="Update my profile")
def update_profile(payload: ProfileUpdate, user: CurrentUser, db: DbSession) -> dict:
    """Partial update - only the supplied fields change."""
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "name" and value:
            value = " ".join(str(value).split())
            if len(value) < 2:
                raise ValidationError("Please enter your full name.", code="invalid_name")
        elif field == "interests" and value is not None:
            value = [str(item).strip().lower() for item in value if str(item).strip()][:12]
        setattr(user, field, value)
    user.onboarding_complete = True
    db.commit()
    db.refresh(user)
    stats = get_or_create_stats(db, user.id)
    return {
        "user": auth_service.serialise_user(user, include_private=True),
        "stats": serialise_stats(stats),
    }


@router.post("/password", response_model=MessageResponse, summary="Change my password")
def change_password(payload: PasswordChange, user: CurrentUser, db: DbSession) -> MessageResponse:
    auth_service.change_password(db, user, payload.current_password, payload.new_password)
    return MessageResponse(message="Password updated. Existing sessions keep working.")


@router.get("/summary", summary="Lightweight counters for the app shell")
def summary(user: CurrentUser, db: DbSession) -> dict:
    from app.services import social_service
    from app.services.stats_service import weekly_total

    stats = get_or_create_stats(db, user.id)
    sync_badge_catalogue(db)
    return {
        "unread_notifications": social_service.unread_notification_count(db, user),
        "streak": stats.current_streak,
        "weekly_minutes": weekly_total(stats),
        "weekly_target_minutes": stats.weekly_target_minutes,
    }
