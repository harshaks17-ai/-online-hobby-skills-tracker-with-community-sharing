"""Authentication + authorization dependencies (the API's identity firewall)."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.utils.errors import AuthError, ForbiddenError
from app.utils.security import TokenError
from cloud.auth_service import verify_identity_token

# auto_error=False lets us raise our own JSON envelope instead of FastAPI's.
bearer_scheme = HTTPBearer(auto_error=False, description="JWT access token")

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
    db: DbSession = None,  # type: ignore[assignment]
) -> User:
    """Resolve the caller from the bearer token, or fail with 401."""
    token: str | None = None
    if credentials and credentials.scheme.lower() == "bearer":
        token = credentials.credentials
    if not token:
        token = request.cookies.get("hobbylog_token") or request.headers.get("X-Auth-Token")

    if not token:
        raise AuthError("Sign in to continue.", code="missing_token")

    try:
        claims = verify_identity_token(token)
    except TokenError as exc:
        raise AuthError(str(exc), code="invalid_token") from exc

    user = db.get(User, claims["sub"])
    if user is None:
        raise AuthError("Account no longer exists.", code="user_not_found")
    if not user.is_active:
        raise ForbiddenError("This account has been deactivated.", code="account_disabled")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_optional_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
    db: DbSession = None,  # type: ignore[assignment]
) -> User | None:
    """Like `get_current_user` but tolerates anonymous callers (public feeds)."""
    try:
        return get_current_user(request, credentials, db)
    except (AuthError, ForbiddenError):
        return None


OptionalUser = Annotated["User | None", Depends(get_optional_user)]


def require_moderator(user: CurrentUser) -> User:
    """Role-based authorization guard (Moderator role from the spec)."""
    if not user.is_moderator:
        raise ForbiddenError("Moderator privileges are required.", code="moderator_required")
    return user


ModeratorUser = Annotated[User, Depends(require_moderator)]
