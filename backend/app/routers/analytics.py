"""Analytics: /api/analytics/*"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.middleware.auth import CurrentUser, DbSession
from app.services import analytics_service, stats_service

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/dashboard", summary="Everything the dashboard renders")
def dashboard(user: CurrentUser, db: DbSession) -> dict:
    """One call, one payload - the dashboard makes exactly this request."""
    return analytics_service.dashboard(db, user)


@router.get("/badges", summary="Badge catalogue + what I have earned")
def badges(user: CurrentUser, db: DbSession) -> dict:
    stats = stats_service.get_or_create_stats(db, user.id)
    earned = set(stats.badges or [])
    return {
        "earned": sorted(earned),
        "items": [
            {**definition, "earned": definition["code"] in earned}
            for definition in stats_service.BADGE_CATALOGUE
        ],
    }


@router.get("/levels", summary="Skill level distribution")
def levels(user: CurrentUser, db: DbSession) -> dict:
    return {"items": analytics_service.level_distribution(db, user.id)}


@router.get("/export", summary="Export my data as JSON (portability / GDPR)")
def export_data(user: CurrentUser, db: DbSession) -> dict:
    """
    Data-portability endpoint: a user can download everything the platform holds
    about them (GDPR Article 20 "right to data portability"). Credentials are
    never included - only the derived, user-visible record.
    """
    from sqlalchemy import select

    from app.models import Goal, Post, PracticeSession, Skill
    from app.services import auth_service, goal_service, practice_service, skill_service

    skills = list(db.scalars(select(Skill).where(Skill.user_id == user.id)).all())
    sessions = list(
        db.scalars(
            select(PracticeSession)
            .where(PracticeSession.user_id == user.id)
            .order_by(PracticeSession.practiced_at.desc())
        ).all()
    )
    goals = list(db.scalars(select(Goal).where(Goal.user_id == user.id)).all())
    posts = list(
        db.scalars(select(Post).where(Post.user_id == user.id).order_by(Post.created_at.desc())).all()
    )
    stats = stats_service.get_or_create_stats(db, user.id)

    return {
        "exported_at": stats.updated_at,
        "profile": auth_service.serialise_user(user, include_private=True),
        "stats": practice_service.serialise_stats(stats),
        "skills": [skill_service.serialise_skill(db, skill) for skill in skills],
        "sessions": [practice_service.serialise_session(db, row) for row in sessions],
        "goals": [goal_service.serialise_goal(db, goal) for goal in goals],
        "posts": [
            {
                "id": post.id,
                "content": post.content,
                "created_at": post.created_at,
                "likes_count": post.likes_count,
                "comments_count": post.comments_count,
            }
            for post in posts
        ],
    }
