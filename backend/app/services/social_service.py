"""Likes, comments, follows and notifications - the social graph."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Comment, Follow, Like, Notification, Post, User
from app.schemas import CommentCreate
from app.utils.errors import ConflictError, NotFoundError, ValidationError
from app.utils.helpers import progress_percent


# ------------------------------------------------------------------- likes --
def toggle_like(db: Session, post: Post, user: User) -> dict[str, Any]:
    """
    Idempotent like toggle.

    Idempotency is enforced by the `uq_like_post_user` UNIQUE constraint, not by
    application logic, so two concurrent taps (or a client retry) can never
    create a duplicate like - the second insert is rejected by the database and
    we degrade gracefully to the already-liked state.
    """
    existing = db.scalar(
        select(Like).where(Like.post_id == post.id, Like.user_id == user.id)
    )
    if existing is not None:
        db.delete(existing)
        post.likes_count = max(0, post.likes_count - 1)
        liked = False
        stale = db.scalar(
            select(Notification).where(
                Notification.user_id == post.user_id,
                Notification.actor_id == user.id,
                Notification.type == "like",
                Notification.link == f"/post/{post.id}",
            )
        )
        if stale is not None:
            db.delete(stale)
    else:
        db.add(Like(post_id=post.id, user_id=user.id))
        post.likes_count += 1
        liked = True
        if post.user_id != user.id:
            db.add(
                Notification(
                    user_id=post.user_id,
                    actor_id=user.id,
                    type="like",
                    message=f"{user.name} liked your update",
                    link=f"/post/{post.id}",
                )
            )
    db.commit()
    db.refresh(post)
    from app.services import stats_service

    stats_service.refresh_social_stats(db, post.user_id)
    db.commit()
    return {"liked": liked, "likes_count": post.likes_count}


def like_post(db: Session, post: Post, user: User) -> dict[str, Any]:
    """Explicit like. Already-liked is a 409, which makes the endpoint strict."""
    if db.scalar(select(Like.id).where(Like.post_id == post.id, Like.user_id == user.id)):
        raise ConflictError("You have already liked this post.", code="already_liked")
    db.add(Like(post_id=post.id, user_id=user.id))
    post.likes_count += 1
    if post.user_id != user.id:
        db.add(
            Notification(
                user_id=post.user_id,
                actor_id=user.id,
                type="like",
                message=f"{user.name} liked your update",
                link=f"/post/{post.id}",
            )
        )
    db.commit()
    db.refresh(post)
    from app.services import stats_service

    stats_service.refresh_social_stats(db, post.user_id)
    db.commit()
    return {"liked": True, "likes_count": post.likes_count}


def unlike_post(db: Session, post: Post, user: User) -> dict[str, Any]:
    existing = db.scalar(
        select(Like).where(Like.post_id == post.id, Like.user_id == user.id)
    )
    if existing is None:
        raise NotFoundError("You have not liked this post.", code="not_liked")
    db.delete(existing)
    post.likes_count = max(0, post.likes_count - 1)
    db.commit()
    db.refresh(post)
    return {"liked": False, "likes_count": post.likes_count}


# --------------------------------------------------------------- comments --
def add_comment(db: Session, post: Post, user: User, payload: CommentCreate) -> dict[str, Any]:
    content = " ".join(payload.content.split())
    if not content:
        raise ValidationError("Comment cannot be empty.", code="empty_comment")
    if payload.parent_id:
        parent = db.get(Comment, payload.parent_id)
        if parent is None or parent.post_id != post.id:
            raise NotFoundError("Parent comment not found.", code="parent_not_found")

    comment = Comment(
        post_id=post.id, user_id=user.id, content=content, parent_id=payload.parent_id
    )
    db.add(comment)
    post.comments_count += 1
    if post.user_id != user.id:
        db.add(
            Notification(
                user_id=post.user_id,
                actor_id=user.id,
                type="comment",
                message=f"{user.name} commented on your update",
                link=f"/post/{post.id}",
            )
        )
    db.commit()
    db.refresh(comment)
    from app.services import stats_service

    stats_service.refresh_social_stats(db, post.user_id)
    db.commit()
    return {
        "id": comment.id,
        "post_id": comment.post_id,
        "user_id": comment.user_id,
        "content": comment.content,
        "created_at": comment.created_at,
        "author": _author(user),
        "comments_count": post.comments_count,
    }


def delete_comment(db: Session, comment_id: str, user: User) -> None:
    """
    Only the comment author, the post author or a moderator may delete.
    Three-way authorisation, evaluated server-side - never trusted from the UI.
    """
    comment = db.get(Comment, comment_id)
    if comment is None:
        raise NotFoundError("Comment not found.", code="comment_not_found")
    post = db.get(Post, comment.post_id)
    is_author = comment.user_id == user.id
    is_post_owner = post is not None and post.user_id == user.id
    if not (is_author or is_post_owner or user.is_moderator):
        raise ValidationError(
            "You can only delete your own comments.", code="not_comment_owner"
        )
    if post is not None:
        post.comments_count = max(0, post.comments_count - 1)
    db.delete(comment)
    db.commit()
    if post is not None:
        from app.services import stats_service

        stats_service.refresh_social_stats(db, post.user_id)
        db.commit()


def list_comments(
    db: Session, post_id: str, page: int = 1, page_size: int = 20
) -> dict[str, Any]:
    page = max(1, page)
    page_size = min(100, max(1, page_size))
    total = int(
        db.scalar(select(func.count(Comment.id)).where(Comment.post_id == post_id)) or 0
    )
    rows = list(
        db.scalars(
            select(Comment)
            .options(selectinload(Comment.author))
            .where(Comment.post_id == post_id)
            .order_by(Comment.created_at.asc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        ).unique().all()
    )
    return {
        "items": [
            {
                "id": c.id,
                "post_id": c.post_id,
                "user_id": c.user_id,
                "content": c.content,
                "created_at": c.created_at,
                "author": _author(c.author),
            }
            for c in rows
        ],
        "page": page,
        "page_size": page_size,
        "total": total,
        "has_next": page * page_size < total,
        "has_prev": page > 1,
    }


def likers(db: Session, post_id: str, limit: int = 20) -> list[dict[str, Any]]:
    rows = db.execute(
        select(Like, User)
        .join(User, User.id == Like.user_id)
        .where(Like.post_id == post_id)
        .order_by(Like.created_at.desc())
        .limit(limit)
    ).all()
    return [_author(user) for _, user in rows]


# ---------------------------------------------------------------- follows --
def follow_user(db: Session, follower: User, target: User) -> dict[str, Any]:
    if follower.id == target.id:
        raise ValidationError("You cannot follow yourself.", code="self_follow")
    if _follow_row(db, follower.id, target.id):
        raise ConflictError("You already follow this user.", code="already_following")
    db.add(Follow(follower_id=follower.id, following_id=target.id))
    db.add(
        Notification(
            user_id=target.id,
            actor_id=follower.id,
            type="follow",
            message=f"{follower.name} started following you",
            link=f"/u/{target.username}",
        )
    )
    db.commit()
    from app.services import stats_service

    for user_id in (follower.id, target.id):
        stats_service.refresh_social_stats(db, user_id)
    db.commit()
    return {"following": True, "followers_count": _count(db, Follow.following_id, target.id)}


def unfollow_user(db: Session, follower: User, target: User) -> dict[str, Any]:
    row = _follow_row(db, follower.id, target.id)
    if row is None:
        raise NotFoundError("You do not follow this user.", code="not_following")
    db.delete(row)
    db.commit()
    from app.services import stats_service

    for user_id in (follower.id, target.id):
        stats_service.refresh_social_stats(db, user_id)
    db.commit()
    return {"following": False, "followers_count": _count(db, Follow.following_id, target.id)}


def _follow_row(db: Session, follower_id: str, following_id: str) -> Follow | None:
    return db.scalar(
        select(Follow).where(
            Follow.follower_id == follower_id, Follow.following_id == following_id
        )
    )


def is_following(db: Session, follower_id: str, following_id: str) -> bool:
    return _follow_row(db, follower_id, following_id) is not None


def _count(db: Session, column, user_id: str) -> int:
    return int(db.scalar(select(func.count(Follow.id)).where(column == user_id)) or 0)


def followers(db: Session, user_id: str) -> list[dict[str, Any]]:
    rows = db.execute(
        select(User).join(Follow, Follow.follower_id == User.id)
        .where(Follow.following_id == user_id)
        .order_by(Follow.created_at.desc())
    ).scalars().all()
    return [_author(user) for user in rows]


def following(db: Session, user_id: str) -> list[dict[str, Any]]:
    rows = db.execute(
        select(User).join(Follow, Follow.following_id == User.id)
        .where(Follow.follower_id == user_id)
        .order_by(Follow.created_at.desc())
    ).scalars().all()
    return [_author(user) for user in rows]


# ---------------------------------------------------------- notifications --
def list_notifications(
    db: Session, user: User, limit: int = 30
) -> list[dict[str, Any]]:
    rows = list(
        db.scalars(
            select(Notification)
            .options(selectinload(Notification.actor))
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc())
            .limit(limit)
        ).unique().all()
    )
    return [
        {
            "id": n.id,
            "type": n.type,
            "message": n.message,
            "link": n.link,
            "read": n.read,
            "created_at": n.created_at,
            "actor": _author(n.actor) if n.actor else None,
        }
        for n in rows
    ]


def unread_notification_count(db: Session, user: User) -> int:
    return int(
        db.scalar(
            select(func.count(Notification.id)).where(
                Notification.user_id == user.id, Notification.read.is_(False)
            )
        )
        or 0
    )


def mark_notifications_read(db: Session, user: User) -> None:
    for notification in db.scalars(
        select(Notification).where(
            Notification.user_id == user.id, Notification.read.is_(False)
        )
    ).all():
        notification.read = True
    db.commit()


def _author(user: User | None) -> dict[str, Any] | None:
    if user is None:
        return None
    return {
        "id": user.id,
        "name": user.name,
        "username": user.username,
        "bio": user.bio,
        "avatar_url": user.avatar_url,
        "banner_url": user.banner_url,
        "location": user.location,
        "website": user.website,
        "interests": user.interests or [],
        "created_at": user.created_at,
        "is_moderator": user.is_moderator,
    }


def utc_timestamp() -> datetime:
    return datetime.now(timezone.utc)
