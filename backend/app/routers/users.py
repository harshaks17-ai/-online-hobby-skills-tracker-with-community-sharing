"""User directory: public profiles, follow graph, leaderboard, discovery."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.middleware.auth import CurrentUser, DbSession, OptionalUser
from app.schemas import MessageResponse
from app.services import analytics_service, auth_service, social_service
from app.utils.errors import NotFoundError

router = APIRouter(prefix="/users", tags=["Users"])


def _resolve(db, identifier: str):
    target = auth_service.find_by_username(db, identifier)
    if target is None or not target.is_active:
        raise NotFoundError("Profile not found.", code="profile_not_found")
    return target


@router.get("/search", summary="Find people by username or name")
def search_people(
    q: str = Query(min_length=1, max_length=60),
    user: CurrentUser = None,  # type: ignore[assignment]
    db: DbSession = None,  # type: ignore[assignment]
) -> dict:
    people = auth_service.search_users(db, q, exclude_id=user.id, limit=20)
    return {
        "items": [
            {
                "id": person.id,
                "name": person.name,
                "username": person.username,
                "bio": person.bio,
                "avatar_url": person.avatar_url,
                "is_following": social_service.is_following(db, user.id, person.id),
            }
            for person in people
        ]
    }


@router.get("/leaderboard", summary="Top contributors by practice time")
def leaderboard(
    limit: int = Query(default=10, ge=1, le=50), db: DbSession = None  # type: ignore[assignment]
) -> dict:
    return {"items": analytics_service.leaderboard(db, limit=limit)}


@router.get("/me/followers", summary="My followers")
def my_followers(user: CurrentUser, db: DbSession) -> dict:
    return {"items": social_service.followers(db, user.id)}


@router.get("/me/following", summary="People I follow")
def my_following(user: CurrentUser, db: DbSession) -> dict:
    return {"items": social_service.following(db, user.id)}


@router.get("/{username}", summary="Public profile")
def public_profile(username: str, user: OptionalUser, db: DbSession) -> dict:
    """
    Public read model. Deliberately omits e-mail, login timestamps and any
    private skill - a public API must never leak another user's private data.
    """
    return analytics_service.public_profile(db, _resolve(db, username), user)


@router.get("/{username}/followers", summary="Followers of a user")
def followers(username: str, db: DbSession) -> dict:
    return {"items": social_service.followers(db, _resolve(db, username).id)}


@router.get("/{username}/following", summary="Following of a user")
def following(username: str, db: DbSession) -> dict:
    return {"items": social_service.following(db, _resolve(db, username).id)}


@router.post("/{username}/follow", response_model=MessageResponse, summary="Follow a user")
def follow(username: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    result = social_service.follow_user(db, user, _resolve(db, username))
    return MessageResponse(
        message=f"You are now following @{username}.", data=result
    )


@router.delete("/{username}/follow", response_model=MessageResponse, summary="Unfollow a user")
def unfollow(username: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    result = social_service.unfollow_user(db, user, _resolve(db, username))
    return MessageResponse(message=f"You unfollowed @{username}.", data=result)


@router.delete("/me", response_model=MessageResponse, summary="Delete my account")
def delete_account(user: CurrentUser, db: DbSession) -> MessageResponse:
    """
    Right-to-be-forgotten: cascade delete removes the profile, skills, sessions,
    goals, posts, comments, likes, follows, files and notification records.
    (Object storage objects are removed by a storage lifecycle rule in the
    managed deployment; locally we sweep them here.)
    """
    from app.models import FileAsset
    from sqlalchemy import select

    from cloud import storage_service

    for asset in db.scalars(select(FileAsset).where(FileAsset.user_id == user.id)).all():
        storage_service.delete_object(asset.storage_path)

    db.delete(user)
    db.commit()
    return MessageResponse(message="Your account and all associated data were deleted.")
