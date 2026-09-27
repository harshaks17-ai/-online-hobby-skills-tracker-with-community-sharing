"""Likes, comments and notifications."""

from __future__ import annotations

from fastapi import APIRouter, status

from app.middleware.auth import CurrentUser, DbSession
from app.schemas import CommentCreate, MessageResponse
from app.services import post_service, social_service

router = APIRouter(tags=["Social"])


@router.post(
    "/api/posts/{post_id}/like",
    status_code=status.HTTP_201_CREATED,
    summary="Like a post (strict)",
)
def like(post_id: str, user: CurrentUser, db: DbSession) -> dict:
    """
    201 on first like, **409 `already_liked`** on a duplicate.
    The uniqueness is enforced by a DB constraint, so concurrent taps are safe.
    """
    post = post_service.visible_post(db, post_id, user)
    return social_service.like_post(db, post, user)


@router.delete("/api/posts/{post_id}/like", summary="Remove my like")
def unlike(post_id: str, user: CurrentUser, db: DbSession) -> dict:
    post = post_service.visible_post(db, post_id, user)
    return social_service.unlike_post(db, post, user)


@router.post("/api/posts/{post_id}/toggle-like", summary="Toggle like (idempotent client helper)")
def toggle(post_id: str, user: CurrentUser, db: DbSession) -> dict:
    post = post_service.visible_post(db, post_id, user)
    return social_service.toggle_like(db, post, user)


@router.post(
    "/api/posts/{post_id}/comments",
    status_code=status.HTTP_201_CREATED,
    summary="Comment on a post",
)
def comment(post_id: str, payload: CommentCreate, user: CurrentUser, db: DbSession) -> dict:
    post = post_service.visible_post(db, post_id, user)
    return social_service.add_comment(db, post, user, payload)


@router.delete("/api/comments/{comment_id}", response_model=MessageResponse, summary="Delete a comment")
def delete_comment(comment_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    """
    Allowed for the comment author, the post owner or a moderator.
    Any other caller receives 422 `not_comment_owner`.
    """
    social_service.delete_comment(db, comment_id, user)
    return MessageResponse(message="Comment deleted.", data={"id": comment_id})


@router.get("/api/notifications", summary="My notifications")
def notifications(user: CurrentUser, db: DbSession) -> dict:
    items = social_service.list_notifications(db, user)
    return {
        "items": items,
        "unread": sum(1 for item in items if not item["read"]),
    }


@router.post("/api/notifications/read", response_model=MessageResponse, summary="Mark all read")
def read_all(user: CurrentUser, db: DbSession) -> MessageResponse:
    social_service.mark_notifications_read(db, user)
    return MessageResponse(message="All notifications marked as read.")
