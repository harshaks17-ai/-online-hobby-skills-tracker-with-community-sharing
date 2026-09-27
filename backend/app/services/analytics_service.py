"""
Analytics service - turns the raw session log into dashboard payloads.

All of these aggregates are computed in SQL (not in Python loops) so the same
code scales to millions of rows by swapping in a columnar warehouse later.
Every chart the UI renders is a pure function of this response, which is why the
frontend has no analytics logic of its own.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Comment,
    Follow,
    Goal,
    Like,
    Milestone,
    Post,
    PracticeSession,
    Skill,
    User,
)
from app.services import goal_service, post_service, stats_service
from app.utils.helpers import (
    humanise_minutes,
    last_n_weeks,
    minutes_to_hours,
    progress_percent,
)


def dashboard(db: Session, user: User) -> dict[str, Any]:
    stats = stats_service.get_or_create_stats(db, user.id)
    if stats.total_sessions == 0:
        stats_service.recompute_stats(db, user.id)
        db.refresh(stats)

    skills = list(
        db.scalars(select(Skill).where(Skill.user_id == user.id)).all()
    )
    goals = list(
        db.scalars(select(Goal).where(Goal.user_id == user.id)).all()
    )
    today = datetime.now(timezone.utc).date()
    week_key = f"{today.isocalendar()[0]}-W{today.isocalendar()[1]:02d}"
    weekly_minutes = int((stats.weekly_minutes or {}).get(week_key, 0))

    total_hours = minutes_to_hours(stats.total_minutes)
    active_skills = [s for s in skills if s.status == "ACTIVE"]

    return {
        "stats": practice_service_stats(stats),
        "headline": {
            "total_hours": total_hours,
            "total_minutes": stats.total_minutes,
            "total_sessions": stats.total_sessions,
            "current_streak": stats.current_streak,
            "longest_streak": stats.longest_streak,
            "weekly_minutes": weekly_minutes,
            "weekly_target_minutes": stats.weekly_target_minutes,
            "weekly_progress_percent": progress_percent(
                weekly_minutes, stats.weekly_target_minutes
            ),
            "active_skills": len(active_skills),
            "total_skills": len(skills),
            "goals_completed": stats.goals_completed,
            "goals_active": sum(1 for g in goals if g.status == "ACTIVE"),
            "milestones_achieved": stats.milestones_achieved,
            "posts_count": stats.posts_count,
            "likes_received": stats.likes_received,
            "comments_received": stats.comments_received,
            "followers_count": stats.followers_count,
            "following_count": stats.following_count,
            "badges": list(stats.badges or []),
            "hours_readable": humanise_minutes(stats.total_minutes),
        },
        "charts": {
            "by_skill": practice_hours_by_skill(db, user.id),
            "weekly_trend": weekly_trend(db, user.id, weeks=8),
            "daily_30": daily_series(db, user.id, days=30),
            "heatmap": stats_service.heatmap(stats, weeks=26),
            "distribution": skill_distribution(db, user.id),
            "goal_progress": goal_completion(db, user.id),
            "activity_by_hour": activity_by_hour(db, user.id),
        },
        "recent_activity": recent_activity(db, user, limit=8),
        "recent_sessions": recent_sessions(db, user, limit=6),
        "top_skills": [serialise_skill_row(db, s) for s in sorted(
            skills, key=lambda s: s.total_minutes, reverse=True
        )[:5]],
        "achievements": goal_service.achievement_feed(db, user, limit=6),
        "goals_summary": goal_service.goals_summary(goals),
        "community": community_pulse(db, user),
    }


def practice_service_stats(stats) -> dict[str, Any]:
    return {
        "total_minutes": stats.total_minutes,
        "total_sessions": stats.total_sessions,
        "current_streak": stats.current_streak,
        "longest_streak": stats.longest_streak,
        "last_log_date": stats.last_log_date,
        "active_days": stats.active_days,
        "goals_completed": stats.goals_completed,
        "milestones_achieved": stats.milestones_achieved,
        "posts_count": stats.posts_count,
        "likes_received": stats.likes_received,
        "comments_received": stats.comments_received,
        "followers_count": stats.followers_count,
        "following_count": stats.following_count,
        "badges": list(stats.badges or []),
        "weekly_target_minutes": stats.weekly_target_minutes,
        "weekly_minutes": dict(stats.weekly_minutes or {}),
        "daily_minutes": dict(stats.daily_minutes or {}),
    }


def practice_hours_by_skill(db: Session, user_id: str) -> list[dict[str, Any]]:
    rows = db.execute(
        select(
            Skill.id,
            Skill.title,
            Skill.icon,
            Skill.accent,
            Skill.category,
            func.coalesce(func.sum(PracticeSession.duration_minutes), 0),
            func.count(PracticeSession.id),
        )
        .outerjoin(PracticeSession, PracticeSession.skill_id == Skill.id)
        .where(Skill.user_id == user_id)
        .group_by(Skill.id)
        .order_by(func.coalesce(func.sum(PracticeSession.duration_minutes), 0).desc())
    ).all()
    return [
        {
            "id": row[0],
            "title": row[1],
            "icon": row[2],
            "accent": row[3],
            "category": row[4],
            "minutes": int(row[5] or 0),
            "hours": minutes_to_hours(int(row[5] or 0)),
            "sessions": int(row[6] or 0),
        }
        for row in rows
    ]


def weekly_trend(db: Session, user_id: str, weeks: int = 8) -> list[dict[str, Any]]:
    since = datetime.now(timezone.utc) - timedelta(weeks=weeks)
    rows = db.execute(
        select(PracticeSession.practiced_at, PracticeSession.duration_minutes).where(
            PracticeSession.user_id == user_id, PracticeSession.practiced_at >= since
        )
    ).all()
    buckets: dict[str, int] = {}
    from app.utils.helpers import as_utc, iso_week_key

    for practiced_at, minutes in rows:
        key = iso_week_key(as_utc(practiced_at).date())
        buckets[key] = buckets.get(key, 0) + int(minutes or 0)
    return [
        {
            "week": key,
            "label": f"W{key.split('-W')[-1]}",
            "minutes": buckets.get(key, 0),
            "hours": minutes_to_hours(buckets.get(key, 0)),
        }
        for key in last_n_weeks(weeks)
    ]


def daily_series(db: Session, user_id: str, days: int = 30) -> list[dict[str, Any]]:
    stats = stats_service.get_or_create_stats(db, user_id)
    return stats_service.day_series(stats, days=days)


def skill_distribution(db: Session, user_id: str) -> list[dict[str, Any]]:
    """Share of total practice time per category - feeds the donut chart."""
    rows = db.execute(
        select(
            Skill.category,
            func.coalesce(func.sum(PracticeSession.duration_minutes), 0),
        )
        .join(PracticeSession, PracticeSession.skill_id == Skill.id)
        .where(Skill.user_id == user_id)
        .group_by(Skill.category)
        .order_by(func.coalesce(func.sum(PracticeSession.duration_minutes), 0).desc())
    ).all()
    total = sum(int(row[1] or 0) for row in rows) or 1
    return [
        {
            "category": row[0],
            "minutes": int(row[1] or 0),
            "hours": minutes_to_hours(int(row[1] or 0)),
            "percent": round(int(row[1] or 0) / total * 100, 1),
        }
        for row in rows
    ]


def goal_completion(db: Session, user_id: str) -> list[dict[str, Any]]:
    goals = list(
        db.scalars(select(Goal).where(Goal.user_id == user_id).order_by(Goal.created_at.desc())).all()
    )
    return [goal_service.serialise_goal(db, goal) for goal in goals[:8]]


def activity_by_hour(db: Session, user_id: str) -> list[dict[str, Any]]:
    """When during the day the user practises - 24 buckets, UTC on SQLite."""
    buckets = [0] * 24
    for practiced_at in db.scalars(
        select(PracticeSession.practiced_at).where(PracticeSession.user_id == user_id)
    ).all():
        buckets[practiced_at.hour] += 1
    peak = max(buckets) or 1
    return [
        {"hour": hour, "sessions": count, "intensity": round(count / peak, 3)}
        for hour, count in enumerate(buckets)
    ]


def recent_activity(db: Session, user: User, limit: int = 10) -> list[dict[str, Any]]:
    """Unified timeline: sessions, posts, milestones, goals."""
    events: list[dict[str, Any]] = []
    skill_titles = {s.id: s for s in db.scalars(select(Skill).where(Skill.user_id == user.id)).all()}

    for session in db.scalars(
        select(PracticeSession)
        .where(PracticeSession.user_id == user.id)
        .order_by(PracticeSession.practiced_at.desc())
        .limit(limit)
    ).all():
        skill = skill_titles.get(session.skill_id)
        events.append(
            {
                "type": "practice",
                "title": f"Logged {humanise_minutes(session.duration_minutes)} on {skill.title if skill else 'a skill'}",
                "subtitle": session.activity or session.notes[:80],
                "icon": skill.icon if skill else "⏱️",
                "accent": skill.accent if skill else "violet",
                "timestamp": session.practiced_at,
                "link": f"/skills/{session.skill_id}",
            }
        )
    for post in db.scalars(
        select(Post).where(Post.user_id == user.id).order_by(Post.created_at.desc()).limit(limit)
    ).all():
        events.append(
            {
                "type": "post",
                "title": "Shared an update with the community",
                "subtitle": post.content[:90],
                "icon": "💬",
                "accent": "sky",
                "timestamp": post.created_at,
                "link": f"/post/{post.id}",
            }
        )
    for milestone in db.execute(
        select(Milestone, Goal)
        .join(Goal, Goal.id == Milestone.goal_id)
        .where(Milestone.user_id == user.id, Milestone.achieved.is_(True))
        .order_by(Milestone.achieved_at.desc())
        .limit(limit)
    ).all():
        events.append(
            {
                "type": "milestone",
                "title": f"Achieved milestone: {milestone[0].title}",
                "subtitle": milestone[1].title,
                "icon": "🏁",
                "accent": "amber",
                "timestamp": milestone[0].achieved_at,
                "link": "/goals",
            }
        )
    events.sort(key=lambda e: e["timestamp"] or datetime.min.replace(tzinfo=timezone.utc),
                reverse=True)
    return events[:limit]


def recent_sessions(db: Session, user: User, limit: int = 6) -> list[dict[str, Any]]:
    from app.services.practice_service import serialise_session

    rows = db.scalars(
        select(PracticeSession)
        .where(PracticeSession.user_id == user.id)
        .order_by(PracticeSession.practiced_at.desc())
        .limit(limit)
    ).all()
    return [serialise_session(db, row) for row in rows]


def serialise_skill_row(db: Session, skill: Skill) -> dict[str, Any]:
    from app.services.skill_service import serialise_skill

    return serialise_skill(db, skill)


def community_pulse(db: Session, user: User) -> dict[str, Any]:
    """How the user's content is performing + what the community is doing."""
    likes_on_my_posts = int(
        db.scalar(
            select(func.count(Like.id))
            .join(Post, Post.id == Like.post_id)
            .where(Post.user_id == user.id)
        )
        or 0
    )
    comments_on_my_posts = int(
        db.scalar(
            select(func.count(Comment.id))
            .join(Post, Post.id == Comment.post_id)
            .where(Post.user_id == user.id)
        )
        or 0
    )
    posts_by_others = int(
        db.scalar(
            select(func.count(Post.id)).where(Post.user_id != user.id, Post.visibility == "public")
        )
        or 0
    )
    return {
        "likes_received": likes_on_my_posts,
        "comments_received": comments_on_my_posts,
        "posts_shared": int(
            db.scalar(select(func.count(Post.id)).where(Post.user_id == user.id)) or 0
        ),
        "community_posts": posts_by_others,
        "community_users": int(
            db.scalar(select(func.count(func.distinct(Post.user_id))).where(Post.visibility == "public"))
            or 0
        ),
        "trending_skills": post_service.trending_skills(db, limit=6),
        "trending_posts": post_service.trending(db, limit=4),
    }


def public_profile(db: Session, profile: User, viewer: User | None) -> dict[str, Any]:
    """Public profile payload - never exposes e-mail or private counters."""
    skills = list(
        db.scalars(
            select(Skill)
            .where(Skill.user_id == profile.id, Skill.is_public.is_(True))
            .order_by(Skill.total_minutes.desc())
        ).all()
    )
    goals = list(
        db.scalars(select(Goal).where(Goal.user_id == profile.id, Goal.status == "COMPLETED")).all()
    )
    stats = stats_service.get_or_create_stats(db, profile.id)
    return {
        "user": {
            "id": profile.id,
            "name": profile.name,
            "username": profile.username,
            "bio": profile.bio,
            "avatar_url": profile.avatar_url,
            "banner_url": profile.banner_url,
            "location": profile.location,
            "website": profile.website,
            "interests": profile.interests or [],
            "created_at": profile.created_at,
            "is_moderator": profile.is_moderator,
        },
        "is_following": bool(
            viewer
            and db.scalar(
                select(Follow.id).where(
                    Follow.follower_id == viewer.id, Follow.following_id == profile.id
                )
            )
        ),
        "is_self": bool(viewer and viewer.id == profile.id),
        "skills": [serialise_skill_row(db, skill) for skill in skills],
        "goals": [goal_service.serialise_goal(db, goal) for goal in goals[:6]],
        "stats": {
            "total_minutes": stats.total_minutes,
            "total_sessions": stats.total_sessions,
            "current_streak": stats.current_streak,
            "longest_streak": stats.longest_streak,
            "posts_count": stats.posts_count,
            "followers_count": stats.followers_count,
            "following_count": stats.following_count,
            "badges": list(stats.badges or []),
        },
        "badges": [
            definition
            for definition in stats_service.BADGE_CATALOGUE
            if definition["code"] in set(stats.badges or [])
        ],
    }


def leaderboard(db: Session, limit: int = 10) -> list[dict[str, Any]]:
    """Top contributors by total practice minutes (public stats only)."""
    rows = db.execute(
        select(
            User.id,
            User.name,
            User.username,
            User.avatar_url,
            User.bio,
            User.is_moderator,
            User.created_at,
            func.coalesce(func.sum(PracticeSession.duration_minutes), 0),
            func.count(PracticeSession.id),
        )
        .join(PracticeSession, PracticeSession.user_id == User.id)
        .where(User.is_active.is_(True))
        .group_by(User.id)
        .order_by(func.coalesce(func.sum(PracticeSession.duration_minutes), 0).desc())
        .limit(limit)
    ).all()
    return [
        {
            "rank": index + 1,
            "id": row[0],
            "name": row[1],
            "username": row[2],
            "avatar_url": row[3],
            "bio": row[4],
            "is_moderator": row[5],
            "created_at": row[6],
            "total_minutes": int(row[7] or 0),
            "total_hours": minutes_to_hours(int(row[7] or 0)),
            "total_sessions": int(row[8] or 0),
        }
        for index, row in enumerate(rows)
    ]


def category_breakdown(db: Session) -> list[dict[str, Any]]:
    """Community-wide category totals - the 'Community' dashboard."""
    rows = db.execute(
        select(
            Skill.category,
            func.count(func.distinct(Skill.id)),
            func.coalesce(func.sum(PracticeSession.duration_minutes), 0),
        )
        .join(PracticeSession, PracticeSession.skill_id == Skill.id)
        .group_by(Skill.category)
        .order_by(func.coalesce(func.sum(PracticeSession.duration_minutes), 0).desc())
    ).all()
    return [
        {
            "category": row[0],
            "skills": int(row[1] or 0),
            "minutes": int(row[2] or 0),
            "hours": minutes_to_hours(int(row[2] or 0)),
        }
        for row in rows
    ]


def platform_health(db: Session) -> dict[str, Any]:
    """Public platform counters for the landing page - no PII."""
    total_users = int(db.scalar(select(func.count(User.id)).where(User.is_active.is_(True))) or 0)
    total_sessions = int(db.scalar(select(func.count(PracticeSession.id))) or 0)
    total_minutes = int(
        db.scalar(select(func.coalesce(func.sum(PracticeSession.duration_minutes), 0))) or 0
    )
    total_posts = int(db.scalar(select(func.count(Post.id))) or 0)
    total_skills = int(db.scalar(select(func.count(Skill.id))) or 0)
    total_goals = int(db.scalar(select(func.count(Goal.id))) or 0)
    return {
        "users": total_users,
        "sessions": total_sessions,
        "practice_hours": minutes_to_hours(total_minutes),
        "posts": total_posts,
        "skills": total_skills,
        "goals": total_goals,
    }


def skill_directory(db: Session, search: str | None, category: str | None,
                    limit: int = 24) -> list[dict[str, Any]]:
    """Discover page: popular public skills across the community."""
    statement = (
        select(
            Skill.id,
            Skill.title,
            Skill.icon,
            Skill.accent,
            Skill.category,
            Skill.description,
            Skill.total_minutes,
            User.name,
            User.username,
            User.avatar_url,
        )
        .join(User, User.id == Skill.user_id)
        .where(Skill.is_public.is_(True), User.is_active.is_(True))
    )
    if category and category != "all":
        statement = statement.where(Skill.category == category.lower())
    if search:
        pattern = f"%{search.strip()}%"
        statement = statement.where(
            func.lower(Skill.title).like(pattern) | func.lower(Skill.description).like(pattern)
        )
    rows = db.execute(
        statement.order_by(Skill.total_minutes.desc()).limit(limit)
    ).all()
    return [
        {
            "id": row[0],
            "title": row[1],
            "icon": row[2],
            "accent": row[3],
            "category": row[4],
            "description": row[5],
            "total_minutes": int(row[6] or 0),
            "hours": minutes_to_hours(int(row[6] or 0)),
            "owner_name": row[7],
            "owner_username": row[8],
            "owner_avatar": row[9],
        }
        for row in rows
    ]


def platform_daily_activity(db: Session, days: int = 14) -> list[dict[str, Any]]:
    from app.utils.helpers import as_utc

    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = db.execute(
        select(PracticeSession.practiced_at).where(PracticeSession.practiced_at >= since)
    ).scalars().all()
    buckets: dict[str, int] = {}
    for practiced_at in rows:
        key = as_utc(practiced_at).date().isoformat()
        buckets[key] = buckets.get(key, 0) + 1
    return [
        {"date": key, "sessions": value}
        for key, value in sorted(buckets.items())
    ]


def level_distribution(db: Session, user_id: str) -> list[dict[str, Any]]:
    rows = db.execute(
        select(Skill.current_level, func.count(Skill.id))
        .where(Skill.user_id == user_id)
        .group_by(Skill.current_level)
    ).all()
    return [{"level": row[0], "count": int(row[1])} for row in rows]


def streak_risk(days_since_last_log: int, streak: int) -> str:
    """Copy helper so the UI can nudge the user at the right moment."""
    if streak == 0:
        return "Start a new streak today."
    if days_since_last_log == 0:
        return "Streak secured for today. Come back tomorrow to keep it."
    if days_since_last_log == 1:
        return "Log a session today or your streak resets."
    return "Your streak has lapsed. Restart it today."
