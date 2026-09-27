"""Authentication service: registration, login, refresh, account lifecycle."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import User, UserStats
from app.schemas import RegisterRequest
from app.services.stats_service import get_or_create_stats, sync_badge_catalogue
from app.utils.errors import AuthError, ConflictError, NotFoundError
from app.utils.security import create_token, hash_password, verify_password


def find_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(func.lower(User.email) == email.strip().lower()))


def find_by_username(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(User.username == username.strip().lower()))


def get_user_by_id(db: Session, user_id: str) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found.", code="user_not_found")
    return user


def register(db: Session, payload: RegisterRequest) -> User:
    """Create an account. Duplicate e-mail/username is a 409, never a 500."""
    email = payload.email.strip().lower()
    username = payload.username.strip().lower()

    if find_by_email(db, email):
        raise ConflictError("An account with that email already exists.", code="email_taken")
    if find_by_username(db, username):
        raise ConflictError("That username is taken.", code="username_taken")

    user = User(
        email=email,
        username=username,
        name=payload.name.strip(),
        bio=payload.bio.strip(),
        interests=[i.strip().lower() for i in payload.interests if i.strip()][:12],
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(user)
    db.flush()

    stats = get_or_create_stats(db, user.id)
    stats.badges = []
    sync_badge_catalogue(db)

    # Starter skill so a brand-new account is never an empty screen.
    from app.models import Skill

    starter = Skill(
        user_id=user.id,
        title="My first skill",
        category="other",
        description="A skill you are just beginning. Log your first session to start the streak.",
        icon="🌟",
        accent="violet",
        goal_per_week=120,
        minutes_per_session=30,
    )
    db.add(starter)
    db.commit()
    db.refresh(user)
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    """
    Verify credentials. The same generic message is returned for an unknown
    e-mail and a wrong password, so the endpoint cannot be used to enumerate
    registered accounts.
    """
    user = find_by_email(db, email) or find_by_username(db, email)
    if user is None:
        # Burn roughly the same amount of time as a real verification would,
        # removing a timing oracle.
        verify_password(password, "pbkdf2_sha256$210000$00$00")
        raise AuthError("Incorrect email or password.", code="invalid_credentials")
    if not verify_password(password, user.password_hash):
        raise AuthError("Incorrect email or password.", code="invalid_credentials")
    if not user.is_active:
        raise AuthError("This account has been deactivated.", code="account_disabled")

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return user


def issue_tokens(user: User) -> dict[str, Any]:
    claims = {
        "username": user.username,
        "role": "moderator" if user.is_moderator else "user",
    }
    return {
        "access_token": create_token(user.id, "access", extra_claims=claims),
        "refresh_token": create_token(user.id, "refresh", extra_claims=claims),
        "token_type": "bearer",
        "expires_in": settings.access_token_expire_minutes * 60,
    }


def change_password(db: Session, user: User, current_password: str, new_password: str) -> None:
    if not verify_password(current_password, user.password_hash):
        raise AuthError("Current password is incorrect.", code="invalid_credentials")
    if current_password == new_password:
        raise AuthError("Choose a password you have not used before.", code="password_reuse")
    user.password_hash = hash_password(new_password)
    db.commit()


def search_users(
    db: Session, term: str, exclude_id: str | None = None, limit: int = 12
) -> list[User]:
    pattern = f"%{term.strip().lower()}%"
    statement = (
        select(User)
        .where(
            User.is_active.is_(True),
            or_(
                func.lower(User.username).like(pattern),
                func.lower(User.name).like(pattern),
            ),
        )
        .order_by(User.username)
        .limit(limit)
    )
    if exclude_id:
        statement = statement.where(User.id != exclude_id)
    return list(db.scalars(statement).all())


def serialise_user(user: User, include_private: bool = False) -> dict[str, Any]:
    data: dict[str, Any] = {
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
    if include_private:
        data.update(
            {
                "email": user.email,
                "is_active": user.is_active,
                "profile_visibility": user.profile_visibility,
                "onboarding_complete": user.onboarding_complete,
                "last_login_at": user.last_login_at,
            }
        )
    return data
