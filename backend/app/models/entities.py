"""
Relational schema for the platform.

Design notes (cloud-database perspective)
-----------------------------------------
* Every table uses an opaque, sortable, client-generated-ish string primary key
  (`uuid4`) so the same DDL works on Cloud SQL (PostgreSQL/MySQL) *and* on
  Firestore (document id) after a thin mapping layer.
* `created_at` / `updated_at` are stored as timezone-aware UTC timestamps so a
  read replica in another region always agrees on ordering.
* Foreign keys are declared with explicit `ON DELETE CASCADE` semantics and are
  enforced at the engine level (SQLite `PRAGMA foreign_keys=ON`).
* High-cardinality read paths (feed, per-user activity, per-skill history) have
  dedicated composite indexes - see `__table_args__` on each model.
* `likes` and `follows` carry a UNIQUE constraint, which is what makes
  "duplicate like" impossible at the database level rather than in app code
  (idempotency by design).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


# --------------------------------------------------------------------------- #
# Identity & profile
# --------------------------------------------------------------------------- #
class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    bio: Mapped[str] = mapped_column(String(400), default="")
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    banner_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    location: Mapped[str] = mapped_column(String(120), default="")
    website: Mapped[str] = mapped_column(String(200), default="")
    interests: Mapped[list] = mapped_column(JSON, default=list)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_moderator: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    profile_visibility: Mapped[str] = mapped_column(String(20), default="public", nullable=False)
    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    skills: Mapped[list["Skill"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    stats: Mapped["UserStats"] = relationship(
        back_populates="user", cascade="all, delete-orphan",
        passive_deletes=True, uselist=False,
    )

    @property
    def initials(self) -> str:
        parts = [p for p in self.name.split() if p]
        if not parts:
            return self.username[:2].upper()
        if len(parts) == 1:
            return parts[0][:2].upper()
        return (parts[0][0] + parts[-1][0]).upper()


class UserStats(Base, TimestampMixin):
    """Denormalised roll-up maintained by the stats service (Cloud-Function analogue)."""

    __tablename__ = "user_stats"

    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    total_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_sessions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    current_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    longest_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_log_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    weekly_minutes: Mapped[dict] = mapped_column(JSON, default=dict)
    daily_minutes: Mapped[dict] = mapped_column(JSON, default=dict)
    active_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    goals_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    milestones_achieved: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    posts_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    likes_received: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    comments_received: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    followers_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    following_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    badges: Mapped[list] = mapped_column(JSON, default=list)
    weekly_target_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    user: Mapped[User] = relationship(back_populates="stats")


# --------------------------------------------------------------------------- #
# Skills, goals, milestones
# --------------------------------------------------------------------------- #
class Skill(Base, TimestampMixin):
    __tablename__ = "skills"
    __table_args__ = (
        Index("ix_skills_user_status", "user_id", "status"),
        Index("ix_skills_user_created", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="other", index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(8), default="✨")
    accent: Mapped[str] = mapped_column(String(20), default="violet")
    current_level: Mapped[str] = mapped_column(String(20), default="BEGINNER", nullable=False)
    target_level: Mapped[str] = mapped_column(String(20), default="INTERMEDIATE", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", nullable=False, index=True)
    goal_per_week: Mapped[int] = mapped_column(Integer, default=180, nullable=False)
    minutes_per_session: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, default=lambda: utcnow().date(), nullable=False)
    target_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    total_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    session_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user: Mapped[User] = relationship(back_populates="skills")
    sessions: Mapped[list["PracticeSession"]] = relationship(
        back_populates="skill", cascade="all, delete-orphan", passive_deletes=True
    )
    goals: Mapped[list["Goal"]] = relationship(
        back_populates="skill", cascade="all, delete-orphan", passive_deletes=True
    )


class Goal(Base, TimestampMixin):
    __tablename__ = "goals"
    __table_args__ = (Index("ix_goals_user_status", "user_id", "status"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    skill_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("skills.id", ondelete="CASCADE"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    target_value: Mapped[float] = mapped_column(Float, nullable=False, default=100)
    current_value: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    unit: Mapped[str] = mapped_column(String(20), default="minutes")
    kind: Mapped[str] = mapped_column(String(20), default="TOTAL")  # TOTAL | WEEKLY
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    skill: Mapped[Skill | None] = relationship(back_populates="goals")
    milestones: Mapped[list["Milestone"]] = relationship(
        back_populates="goal", cascade="all, delete-orphan", passive_deletes=True,
        order_by="Milestone.target_value",
    )


class Milestone(Base, TimestampMixin):
    __tablename__ = "milestones"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    goal_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("goals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    target_value: Mapped[float] = mapped_column(Float, nullable=False)
    achieved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    achieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    proof_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    goal: Mapped[Goal] = relationship(back_populates="milestones")


# --------------------------------------------------------------------------- #
# Practice logging
# --------------------------------------------------------------------------- #
class PracticeSession(Base, TimestampMixin):
    __tablename__ = "practice_sessions"
    __table_args__ = (
        Index("ix_sessions_user_practiced", "user_id", "practiced_at"),
        Index("ix_sessions_skill_practiced", "skill_id", "practiced_at"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    skill_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("skills.id", ondelete="CASCADE"), nullable=False, index=True
    )
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    activity: Mapped[str] = mapped_column(String(200), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    media_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    mood: Mapped[str] = mapped_column(String(20), default="focused")
    practiced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )

    skill: Mapped[Skill] = relationship(back_populates="sessions")


# --------------------------------------------------------------------------- #
# Community
# --------------------------------------------------------------------------- #
class Post(Base, TimestampMixin):
    __tablename__ = "posts"
    __table_args__ = (
        Index("ix_posts_created", "created_at"),
        Index("ix_posts_user_created", "user_id", "created_at"),
        Index("ix_posts_skill", "skill_id"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    skill_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("skills.id", ondelete="SET NULL"), nullable=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    media_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    milestone_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    visibility: Mapped[str] = mapped_column(String(20), default="public", nullable=False)
    category: Mapped[str] = mapped_column(String(50), default="other", index=True)
    likes_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    comments_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    author: Mapped[User] = relationship()
    skill: Mapped[Skill | None] = relationship()
    comments: Mapped[list["Comment"]] = relationship(
        back_populates="post", cascade="all, delete-orphan", passive_deletes=True
    )
    likes: Mapped[list["Like"]] = relationship(
        back_populates="post", cascade="all, delete-orphan", passive_deletes=True
    )


class Comment(Base, TimestampMixin):
    __tablename__ = "comments"
    __table_args__ = (Index("ix_comments_post_created", "post_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    post_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    parent_id: Mapped[str | None] = mapped_column(String(32), nullable=True)

    post: Mapped[Post] = relationship(back_populates="comments")
    author: Mapped[User] = relationship()


class Like(Base):
    __tablename__ = "likes"
    __table_args__ = (
        UniqueConstraint("post_id", "user_id", name="uq_like_post_user"),
        Index("ix_likes_user", "user_id"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    post_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    post: Mapped[Post] = relationship(back_populates="likes")
    user: Mapped[User] = relationship()


class Follow(Base):
    __tablename__ = "follows"
    __table_args__ = (
        UniqueConstraint("follower_id", "following_id", name="uq_follow_pair"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    follower_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    following_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


# --------------------------------------------------------------------------- #
# Object storage metadata + notifications
# --------------------------------------------------------------------------- #
class FileAsset(Base):
    __tablename__ = "files"
    __table_args__ = (Index("ix_files_user_created", "user_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner_scope: Mapped[str] = mapped_column(String(30), default="misc", nullable=False)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    url: Mapped[str] = mapped_column(String(600), nullable=False)
    visibility: Mapped[str] = mapped_column(String(20), default="private", nullable=False)
    checksum: Mapped[str] = mapped_column(String(80), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_read", "user_id", "read"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    actor_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    type: Mapped[str] = mapped_column(String(40), default="system", nullable=False)
    message: Mapped[str] = mapped_column(String(300), default="")
    link: Mapped[str] = mapped_column(String(300), default="")
    read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    # `actor` is the user who triggered the notification (a like, a follow…),
    # distinct from `user_id` who receives it. Both cascade, because a deleted
    # user must not leave dangling notifications behind.
    actor: Mapped["User | None"] = relationship(
        "User", primaryjoin="Notification.actor_id == User.id", lazy="selectin"
    )


class Report(Base):
    """Moderation queue - demonstrates the Moderator role in the spec."""

    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    reporter_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    target_type: Mapped[str] = mapped_column(String(20), nullable=False)  # post | comment | user
    target_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    reason: Mapped[str] = mapped_column(String(200), default="other")
    details: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="OPEN", nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


class Badge(Base):
    __tablename__ = "badges"

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    title: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(String(200), default="")
    icon: Mapped[str] = mapped_column(String(8), default="🏅")
    tier: Mapped[str] = mapped_column(String(20), default="bronze")
    threshold: Mapped[int] = mapped_column(Integer, default=0)
