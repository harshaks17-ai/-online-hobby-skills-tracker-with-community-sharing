"""Community posts + feed: /api/posts, /api/feed"""

from __future__ import annotations

from fastapi import APIRouter, Query, status

from app.middleware.auth import CurrentUser, DbSession, OptionalUser
from app.schemas import MessageResponse, PostCreate, PostUpdate
from app.services import post_service

router = APIRouter(tags=["Community"])


@router.post("/api/posts", status_code=status.HTTP_201_CREATED, summary="Share an update")
def create_post(payload: PostCreate, user: CurrentUser, db: DbSession) -> dict:
    """201 + the created post. 404 if `skill_id` is not one of your skills."""
    return post_service.create_post(
        db,
        user,
        content=payload.content,
        skill_id=payload.skill_id,
        media_url=payload.media_url,
        milestone_id=payload.milestone_id,
        visibility=payload.visibility,
    )


@router.get("/api/feed", summary="Community feed")
def feed(
    scope: str = Query(default="global", pattern="^(global|following|mine)$"),
    category: str | None = None,
    skill_id: str | None = None,
    user_id: str | None = None,
    search: str | None = None,
    sort: str = Query(default="recent", pattern="^(recent|top)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50),
    viewer: OptionalUser = None,
    db: DbSession = None,  # type: ignore[assignment]
) -> dict:
    """
    Paginated feed. `scope=following` requires authentication and is 401 for
    anonymous callers (they get an empty page instead of an error so the
    landing page can reuse the component).
    """
    return post_service.get_feed(
        db,
        viewer,
        scope=scope,
        category=category,
        skill_id=skill_id,
        user_id=user_id,
        search=search,
        sort=sort,
        page=page,
        page_size=page_size,
    )


@router.get("/api/posts/{post_id}", summary="A single post")
def get_post(post_id: str, viewer: OptionalUser, db: DbSession) -> dict:
    post = post_service.visible_post(db, post_id, viewer)
    return post_service.serialise_post(db, post, viewer, comment_limit=50)


@router.put("/api/posts/{post_id}", summary="Edit my post")
def update_post(post_id: str, payload: PostUpdate, user: CurrentUser, db: DbSession) -> dict:
    return post_service.update_post(db, user, post_id, payload.content, payload.visibility)


@router.delete("/api/posts/{post_id}", response_model=MessageResponse, summary="Delete a post")
def delete_post(post_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    """
    Owner-only. A moderator may also remove content (RBAC), which is how the
    moderation queue in the report is actioned.
    """
    post_service.delete_post(db, user, post_id, moderator=True)
    return MessageResponse(message="Post deleted.", data={"id": post_id})


@router.get("/api/posts/{post_id}/comments", summary="Comments on a post")
def list_comments(
    post_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    viewer: OptionalUser = None,
    db: DbSession = None,  # type: ignore[assignment]
) -> dict:
    post_service.visible_post(db, post_id, viewer)
    from app.services import social_service

    return social_service.list_comments(db, post_id, page=page, page_size=page_size)


@router.get("/api/posts/{post_id}/likes", summary="Who liked a post")
def post_likers(post_id: str, db: DbSession) -> dict:
    from app.services import social_service

    post_service.visible_post(db, post_id, None)
    return {"items": social_service.likers(db, post_id)}
