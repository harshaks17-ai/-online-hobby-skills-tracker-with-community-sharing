"""Request/response DTOs. These are the public contract of the REST API."""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

USERNAME_RE = re.compile(r"^[a-z0-9_.]{3,24}$")
CATEGORIES = {
    "music", "photography", "coding", "art", "fitness", "cooking",
    "language", "gaming", "writing", "reading", "gardening", "dance",
    "chess", "design", "business", "other",
}
LEVELS = {"BEGINNER", "INTERMEDIATE", "ADVANCED"}
STATUSES = {"ACTIVE", "PAUSED", "COMPLETED"}


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RequestModel(BaseModel):
    """
    Base for every *incoming* body.

    `extra="forbid"` means an unknown field is a 422 instead of being silently
    dropped. That catches client/contract drift (a typo'd field name, a payload
    from a newer client) at the boundary instead of producing a silent no-op.
    """

    model_config = ConfigDict(extra="forbid")


# ------------------------------------------------------------------- auth ---
class RegisterRequest(RequestModel):
    name: str = Field(min_length=2, max_length=120)
    username: str = Field(min_length=3, max_length=24)
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)
    bio: str = Field(default="", max_length=400)
    interests: list[str] = Field(default_factory=list, max_length=12)

    @field_validator("username")
    @classmethod
    def _username(cls, value: str) -> str:
        value = value.strip().lower()
        if not USERNAME_RE.match(value):
            raise ValueError(
                "Username must be 3-24 characters: lowercase letters, digits, dot or underscore."
            )
        return value

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        cleaned = " ".join(value.strip().split())
        if len(cleaned) < 2:
            raise ValueError("Please enter your full name.")
        return cleaned

    @field_validator("password")
    @classmethod
    def _password(cls, value: str) -> str:
        if value.isdigit() or value.isalpha():
            raise ValueError("Password must mix letters and numbers.")
        return value


class LoginRequest(RequestModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=256)


class RefreshRequest(RequestModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class UserPublic(ORMModel):
    id: str
    name: str
    username: str
    bio: str = ""
    avatar_url: str | None = None
    banner_url: str | None = None
    location: str = ""
    website: str = ""
    interests: list[str] = Field(default_factory=list)
    created_at: datetime
    is_moderator: bool = False


class UserPrivate(UserPublic):
    email: str
    is_active: bool
    profile_visibility: str
    onboarding_complete: bool
    last_login_at: datetime | None = None
    stats: "StatsPublic | None" = None


class AuthResponse(BaseModel):
    user: UserPrivate
    tokens: TokenPair


# --------------------------------------------------------------- profile ---
class ProfileUpdate(RequestModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    bio: str | None = Field(default=None, max_length=400)
    location: str | None = Field(default=None, max_length=120)
    website: str | None = Field(default=None, max_length=200)
    interests: list[str] | None = Field(default=None, max_length=12)
    avatar_url: str | None = None
    banner_url: str | None = None
    profile_visibility: Literal["public", "private"] | None = None

    @field_validator("website")
    @classmethod
    def _website(cls, value: str | None) -> str | None:
        if value and not re.match(r"^https?://", value):
            raise ValueError("Website must start with http:// or https://")
        return value


class PasswordChange(RequestModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


# ---------------------------------------------------------------- skills ---
class SkillCreate(RequestModel):
    title: str = Field(min_length=2, max_length=120)
    category: str = Field(default="other", max_length=50)
    description: str = Field(default="", max_length=2000)
    current_level: Literal["BEGINNER", "INTERMEDIATE", "ADVANCED"] = "BEGINNER"
    target_level: Literal["BEGINNER", "INTERMEDIATE", "ADVANCED"] = "INTERMEDIATE"
    goal_per_week: int = Field(default=180, ge=0, le=10080)
    minutes_per_session: int = Field(default=30, ge=1, le=1440)
    icon: str = Field(default="✨", max_length=8)
    accent: str = Field(default="violet", max_length=20)
    target_date: date | None = None

    @field_validator("category")
    @classmethod
    def _category(cls, value: str) -> str:
        value = value.strip().lower()
        return value if value in CATEGORIES else "other"


class SkillUpdate(RequestModel):
    title: str | None = Field(default=None, min_length=2, max_length=120)
    category: str | None = Field(default=None, max_length=50)
    description: str | None = Field(default=None, max_length=2000)
    current_level: Literal["BEGINNER", "INTERMEDIATE", "ADVANCED"] | None = None
    target_level: Literal["BEGINNER", "INTERMEDIATE", "ADVANCED"] | None = None
    status: Literal["ACTIVE", "PAUSED", "COMPLETED"] | None = None
    goal_per_week: int | None = Field(default=None, ge=0, le=10080)
    minutes_per_session: int | None = Field(default=None, ge=1, le=1440)
    icon: str | None = Field(default=None, max_length=8)
    accent: str | None = Field(default=None, max_length=20)
    target_date: date | None = None
    is_public: bool | None = None

    @field_validator("category")
    @classmethod
    def _category(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip().lower()
        return value if value in CATEGORIES else "other"


class SkillPublic(ORMModel):
    id: str
    user_id: str
    title: str
    category: str
    description: str
    icon: str
    accent: str
    current_level: str
    target_level: str
    status: str
    goal_per_week: int
    minutes_per_session: int
    start_date: date
    target_date: date | None
    total_minutes: int
    session_count: int
    is_public: bool
    created_at: datetime
    # computed
    progress_percent: float = 0
    weekly_minutes: int = 0
    weekly_target: int = 0
    current_streak: int = 0
    last_practiced_at: datetime | None = None
    goal_count: int = 0


# -------------------------------------------------------------- practice ---
class PracticeCreate(RequestModel):
    skill_id: str = Field(min_length=4, max_length=64)
    duration_minutes: int = Field(ge=1, le=1440)
    activity: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=2000)
    practiced_at: datetime | None = None
    media_url: str | None = None
    mood: Literal["rough", "okay", "good", "great", "flow"] = "good"
    share_to_feed: bool = False
    idempotency_key: str | None = Field(default=None, max_length=120)


class PracticeUpdate(RequestModel):
    duration_minutes: int | None = Field(default=None, ge=1, le=1440)
    activity: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=2000)
    practiced_at: datetime | None = None
    mood: str | None = None


class PracticePublic(ORMModel):
    id: str
    user_id: str
    skill_id: str
    duration_minutes: int
    activity: str
    notes: str
    media_url: str | None
    mood: str
    practiced_at: datetime
    created_at: datetime
    skill_title: str = ""
    skill_icon: str = ""
    skill_accent: str = ""


# ----------------------------------------------------------------- goals ---
class MilestoneCreate(RequestModel):
    title: str = Field(min_length=1, max_length=160)
    target_value: float = Field(gt=0, le=1_000_000)


class MilestoneUpdate(RequestModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    target_value: float | None = Field(default=None, gt=0, le=1_000_000)
    proof_url: str | None = None


class MilestonePublic(ORMModel):
    id: str
    goal_id: str
    title: str
    target_value: float
    achieved: bool
    achieved_at: datetime | None
    proof_url: str | None
    created_at: datetime


class GoalCreate(RequestModel):
    skill_id: str | None = Field(default=None, max_length=64)
    title: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=2000)
    target_value: float = Field(gt=0, le=1_000_000)
    unit: Literal["minutes", "hours", "sessions", "pieces", "pages", "km", "reps"] = "minutes"
    kind: Literal["TOTAL", "WEEKLY"] = "TOTAL"
    deadline: date | None = None
    milestones: list[MilestoneCreate] = Field(default_factory=list, max_length=20)


class GoalUpdate(RequestModel):
    title: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    target_value: float | None = Field(default=None, gt=0, le=1_000_000)
    current_value: float | None = Field(default=None, ge=0, le=1_000_000)
    unit: str | None = Field(default=None, max_length=20)
    deadline: date | None = None
    status: Literal["ACTIVE", "PAUSED", "COMPLETED"] | None = None
    milestones: list[MilestoneCreate] | None = None


class GoalPublic(ORMModel):
    id: str
    user_id: str
    skill_id: str | None
    title: str
    description: str
    target_value: float
    current_value: float
    unit: str
    kind: str
    deadline: date | None
    status: str
    completed_at: datetime | None
    created_at: datetime
    progress_percent: float = 0
    skill_title: str = ""
    skill_icon: str = ""
    skill_accent: str = ""
    milestones: list[MilestonePublic] = Field(default_factory=list)


# ----------------------------------------------------------------- posts ---
class CommentCreate(RequestModel):
    content: str = Field(min_length=1, max_length=1200)
    parent_id: str | None = None


class PostCreate(RequestModel):
    content: str = Field(min_length=1, max_length=3000)
    skill_id: str | None = Field(default=None, max_length=64)
    media_url: str | None = None
    milestone_id: str | None = Field(default=None, max_length=64)
    visibility: Literal["public", "followers"] = "public"


class PostUpdate(RequestModel):
    content: str | None = Field(default=None, min_length=1, max_length=3000)
    visibility: Literal["public", "followers"] | None = None


class CommentPublic(ORMModel):
    id: str
    post_id: str
    user_id: str
    content: str
    created_at: datetime
    author: UserPublic | None = None


class PostPublic(ORMModel):
    id: str
    user_id: str
    skill_id: str | None
    content: str
    media_url: str | None
    visibility: str
    category: str
    likes_count: int
    comments_count: int
    is_pinned: bool
    created_at: datetime
    author: UserPublic | None = None
    skill_title: str | None = None
    skill_icon: str | None = None
    skill_accent: str | None = None
    liked_by_me: bool = False
    comments: list[CommentPublic] = Field(default_factory=list)


# ------------------------------------------------------------------ files ---
class FilePublic(ORMModel):
    id: str
    user_id: str
    owner_scope: str
    original_name: str
    storage_path: str
    content_type: str
    size_bytes: int
    url: str
    visibility: str
    checksum: str
    created_at: datetime
    signed_url: str | None = None


# ------------------------------------------------------------------ stats ---
class StatsPublic(ORMModel):
    total_minutes: int
    total_sessions: int
    current_streak: int
    longest_streak: int
    last_log_date: date | None
    active_days: int
    goals_completed: int
    milestones_achieved: int
    posts_count: int
    likes_received: int
    comments_received: int
    followers_count: int
    following_count: int
    badges: list[str] = Field(default_factory=list)
    weekly_target_minutes: int = 0
    weekly_minutes: dict[str, int] = Field(default_factory=dict)
    daily_minutes: dict[str, int] = Field(default_factory=dict)


class NotificationPublic(ORMModel):
    id: str
    type: str
    message: str
    link: str
    read: bool
    created_at: datetime
    actor: UserPublic | None = None


class ReportCreate(RequestModel):
    target_type: Literal["post", "comment", "user"]
    target_id: str = Field(max_length=64)
    reason: str = Field(default="other", max_length=200)
    details: str = Field(default="", max_length=1000)


# ---------------------------------------------------------------- shared ---
class PaginatedMeta(BaseModel):
    page: int
    page_size: int
    total: int
    has_next: bool
    has_prev: bool


class MessageResponse(BaseModel):
    message: str
    data: dict[str, Any] = Field(default_factory=dict)


UserPrivate.model_rebuild()
