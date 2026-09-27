"""Community posts + the feed query.

Feed strategy (documented in the report as fan-out-on-read):

    SELECT ... FROM posts
    WHERE visibility = 'public' [AND user_id IN (:following)]
    ORDER BY created_at DESC
    LIMIT :page_size

Read amplification is O(followers) per read, which is cheap up to roughly 10k
followers - beyond that you pre-materialise a fan-out-on-write timeline
collection. The `scope`/`sort` parameters below let the frontend switch between
the two strategies without an API change.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import Comment, Follow, Like, Post, Skill, User
from app.schemas import PostCreate
from app.utils.errors import NotFoundError, ValidationError
from app.utils.helpers import progress_percent


def _owned_post(db: Session, post_id: str, user: User) -> Post:
    post = db.get(Post, post_id)
    if post is None or post.user_id != user.id:
        # 404 (not 403) for someone else's post: do not leak its existence.
        raise NotFoundError("Post not found.", code="post_not_found")
    return post


def visible_post(db: Session, post_id: str, viewer: User | None) -> Post:
    post = db.get(Post, post_id)
    if post is None:
        raise NotFoundError("Post not found.", code="post_not_found")
    if post.visibility == "followers":
        if viewer is None:
            raise NotFoundError("Post not found.", code="post_not_found")
        if viewer.id != post.user_id and not _is_following(db, viewer.id, post.user_id):
            raise NotFoundError("Post not found.", code="post_not_found")
    return post


def _is_following(db: Session, follower_id: str, following_id: str) -> bool:
    return bool(
        db.scalar(
            select(Follow.id).where(
                Follow.follower_id == follower_id, Follow.following_id == following_id
            )
        )
    )


def create_post(
    db: Session, user: User, content: str, skill_id: str | None = None,
    media_url: str | None = None, milestone_id: str | None = None,
    visibility: str = "public",
) -> dict[str, Any]:
    category = "other"
    if skill_id:
        skill = db.get(Skill, skill_id)
        if skill is None or skill.user_id != user.id:
            raise NotFoundError("Skill not found for this account.", code="skill_not_found")
        category = skill.category

    post = Post(
        user_id=user.id,
        skill_id=skill_id,
        content=content.strip(),
        media_url=media_url,
        milestone_id=milestone_id,
        visibility=visibility,
        category=category,
    )
    db.add(post)
    db.flush()
    db.commit()
    db.refresh(post)

    from app.services import stats_service

    stats_service.refresh_social_stats(db, user.id)
    db.commit()
    return serialise_post(db, post, viewer=user)


def update_post(
    db: Session, user: User, post_id: str, content: str | None, visibility: str | None
) -> dict[str, Any]:
    post = _owned_post(db, post_id, user)
    if content is not None:
        cleaned = content.strip()
        if not cleaned:
            raise ValidationError("Post text cannot be empty.", code="empty_post")
        post.content = cleaned
    if visibility is not None:
        post.visibility = visibility
    db.commit()
    db.refresh(post)
    return serialise_post(db, post, viewer=user)


def delete_post(db: Session, user: User, post_id: str, moderator: bool = False) -> None:
    post = db.get(Post, post_id)
    if post is None:
        raise NotFoundError("Post not found.", code="post_not_found")
    if post.user_id != user.id and not (moderator and user.is_moderator):
        raise ValidationError("You can only delete your own posts.", code="not_post_owner")
    author_id = post.user_id
    db.delete(post)          # cascades -> comments, likes
    db.commit()
    from app.services import stats_service

    stats_service.refresh_social_stats(db, author_id)
    db.commit()


def get_feed(
    db: Session,
    viewer: User | None,
    scope: str = "global",
    category: str | None = None,
    skill_id: str | None = None,
    user_id: str | None = None,
    search: str | None = None,
    sort: str = "recent",
    page: int = 1,
    page_size: int = 10,
) -> dict[str, Any]:
    """
    Community feed with cursor-free pagination.

    `scope`:
      * ``global``    - everything public
      * ``following`` - only people the viewer follows (+ their own posts)
      * ``mine``      - the viewer's own posts
    `sort`:
      * ``recent`` - newest first (uses ix_posts_created)
      * ``top``    - engagement first (composite index in production)
    """
    page = max(1, int(page))
    page_size = min(50, max(1, int(page_size)))

    statement = select(Post).options(
        selectinload(Post.author), selectinload(Post.skill)
    )
    count_statement = select(func.count(Post.id))

    if scope == "mine":
        if viewer is None:
            return _empty_feed(page, page_size)
        statement = statement.where(Post.user_id == viewer.id)
        count_statement = count_statement.where(Post.user_id == viewer.id)
    elif scope == "following":
        if viewer is None:
            return _empty_feed(page, page_size)
        followed = [
            row for row in db.scalars(
                select(Follow.following_id).where(Follow.follower_id == viewer.id)
            ).all()
        ]
        allowed = followed + [viewer.id]
        statement = statement.where(Post.user_id.in_(allowed))
        count_statement = count_statement.where(Post.user_id.in_(allowed))
    else:
        if viewer is not None:
            statement = statement.where(
                or_(
                    Post.visibility == "public",
                    Post.user_id == viewer.id,
                )
            )
            count_statement = count_statement.where(
                or_(Post.visibility == "public", Post.user_id == viewer.id)
            )
        else:
            statement = statement.where(Post.visibility == "public")
            count_statement = count_statement.where(Post.visibility == "public")

    if user_id:
        statement = statement.where(Post.user_id == user_id)
        count_statement = count_statement.where(Post.user_id == user_id)
    if category and category != "all":
        statement = statement.where(Post.category == category.lower())
        count_statement = count_statement.where(Post.category == category.lower())
    if skill_id:
        statement = statement.where(Post.skill_id == skill_id)
        count_statement = count_statement.where(Post.skill_id == skill_id)
    if search:
        pattern = f"%{search.strip()}%"
        statement = statement.where(func.lower(Post.content).like(pattern))
        count_statement = count_statement.where(func.lower(Post.content).like(pattern))

    total = int(db.scalar(count_statement) or 0)
    order = (
        (Post.likes_count.desc(), Post.comments_count.desc(), Post.created_at.desc())
        if sort == "top"
        else (Post.created_at.desc(),)
    )
    rows = list(
        db.scalars(
            statement.order_by(*order).limit(page_size).offset((page - 1) * page_size)
        ).unique().all()
    )
    return {
        "items": [serialise_post(db, post, viewer) for post in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
        "has_next": page * page_size < total,
        "has_prev": page > 1,
    }


def _empty_feed(page: int, page_size: int) -> dict[str, Any]:
    return {
        "items": [], "page": page, "page_size": page_size, "total": 0,
        "has_next": False, "has_prev": False,
    }


def trending(db: Session, limit: int = 8) -> list[dict[str, Any]]:
    """Trending = most engaged public posts from the last 14 days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=14)
    rows = list(
        db.scalars(
            select(Post)
            .options(selectinload(Post.author), selectinload(Post.skill))
            .where(Post.visibility == "public", Post.created_at >= cutoff)
            .order_by((Post.likes_count + Post.comments_count).desc(), Post.created_at.desc())
            .limit(limit)
        ).unique().all()
    )
    return [serialise_post(db, post, None) for post in rows]


def trending_skills(db: Session, limit: int = 8) -> list[dict[str, Any]]:
    """Most-practised public skills across the whole community."""
    from app.models import PracticeSession

    rows = db.execute(
        select(
            Skill.id,
            Skill.title,
            Skill.icon,
            Skill.accent,
            Skill.category,
            func.count(PracticeSession.id).label("sessions"),
            func.coalesce(func.sum(PracticeSession.duration_minutes), 0).label("minutes"),
        )
        .join(PracticeSession, PracticeSession.skill_id == Skill.id)
        .join(User, User.id == Skill.user_id)
        .where(Skill.is_public.is_(True), User.is_active.is_(True))
        .group_by(Skill.id)
        .order_by(func.coalesce(func.sum(PracticeSession.duration_minutes), 0).desc())
        .limit(limit)
    ).all()
    return [
        {
            "id": row[0], "title": row[1], "icon": row[2], "accent": row[3],
            "category": row[4], "sessions": int(row[5]), "minutes": int(row[6]),
        }
        for row in rows
    ]


def serialise_post(
    db: Session, post: Post, viewer: User | None, comment_limit: int = 3
) -> dict[str, Any]:
    liked = False
    if viewer is not None:
        liked = bool(
            db.scalar(
                select(Like.id).where(Like.post_id == post.id, Like.user_id == viewer.id)
            )
        )
    comments = list(
        db.scalars(
            select(Comment)
            .options(selectinload(Comment.author))
            .where(Comment.post_id == post.id)
            .order_by(Comment.created_at.asc())
            .limit(comment_limit)
        ).all()
    )
    skill = post.skill
    return {
        "id": post.id,
        "user_id": post.user_id,
        "skill_id": post.skill_id,
        "content": post.content,
        "media_url": post.media_url,
        "visibility": post.visibility,
        "category": post.category,
        "likes_count": post.likes_count,
        "comments_count": post.comments_count,
        "is_pinned": post.is_pinned,
        "created_at": post.created_at,
        "author": _author_payload(post.author),
        "skill_title": skill.title if skill else None,
        "skill_icon": skill.icon if skill else None,
        "skill_accent": skill.accent if skill else None,
        "liked_by_me": liked,
        "comments": [
            {
                "id": c.id,
                "post_id": c.post_id,
                "user_id": c.user_id,
                "content": c.content,
                "created_at": c.created_at,
                "author": _author_payload(c.author),
            }
            for c in comments
        ],
    }


def _author_payload(user: User | None) -> dict[str, Any] | None:
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


def goal_progress_callout(db: Session, post: Post) -> dict[str, Any] | None:
    """If a post was generated from a goal, surface the goal's progress bar."""
    if not post.skill_id:
        return None
    from app.models import Goal

    goal = db.scalar(
        select(Goal)
        .where(Goal.user_id == post.user_id, Goal.skill_id == post.skill_id)
        .order_by(Goal.created_at.desc())
    )
    if goal is None:
        return None
    return {
        "title": goal.title,
        "progress_percent": progress_percent(goal.current_value, goal.target_value),
        "unit": goal.unit,
    }
