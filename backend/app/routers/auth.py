"""POST /api/auth/register, /login, /refresh, /logout."""

from __future__ import annotations

from fastapi import APIRouter, Response, status

from app.middleware.auth import CurrentUser, DbSession
from app.schemas import AuthResponse, LoginRequest, MessageResponse, RegisterRequest, TokenPair
from app.services import auth_service
from app.utils.errors import AuthError
from app.utils.security import TokenError, decode_token

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an account",
)
def register(payload: RegisterRequest, response: Response, db: DbSession) -> AuthResponse:
    """201 + user + tokens. 409 if the e-mail or username is taken."""
    user = auth_service.register(db, payload)
    tokens = auth_service.issue_tokens(user)
    _set_refresh_cookie(response, tokens["refresh_token"])
    return AuthResponse(user=auth_service.serialise_user(user, include_private=True), tokens=tokens)


@router.post("/login", response_model=AuthResponse, summary="Exchange credentials for tokens")
def login(payload: LoginRequest, response: Response, db: DbSession) -> AuthResponse:
    """
    200 + user + tokens on success.
    401 with a deliberately generic message on failure (no user enumeration).
    """
    user = auth_service.authenticate(db, payload.email, payload.password)
    tokens = auth_service.issue_tokens(user)
    _set_refresh_cookie(response, tokens["refresh_token"])
    return AuthResponse(user=auth_service.serialise_user(user, include_private=True), tokens=tokens)


@router.post("/refresh", response_model=TokenPair, summary="Rotate an access token")
def refresh(payload: dict, db: DbSession) -> TokenPair:
    """
    Accepts `{"refresh_token": "..."}`. A refresh token can never be used as an
    access token because `typ` is verified during decoding.
    """
    token = payload.get("refresh_token")
    if not token:
        raise AuthError("A refresh token is required.", code="missing_refresh_token")
    try:
        claims = decode_token(token, expected_type="refresh")
    except TokenError as exc:
        raise AuthError(str(exc), code="invalid_refresh_token") from exc
    user = auth_service.get_user_by_id(db, claims["sub"])
    return TokenPair(**auth_service.issue_tokens(user))


@router.post("/logout", response_model=MessageResponse, summary="Clear the session cookie")
def logout(response: Response) -> MessageResponse:
    """
    Tokens are stateless, so logout is client-side token disposal plus clearing
    the HttpOnly refresh cookie. A managed IdP would additionally revoke the
    refresh token server-side (documented in the report).
    """
    response.delete_cookie("hobbylog_refresh", path="/api/auth")
    return MessageResponse(message="Signed out.")


@router.get("/me", summary="Current user (token validation probe)")
def me(user: CurrentUser, db: DbSession) -> dict:
    from app.services.practice_service import serialise_stats
    from app.services.stats_service import get_or_create_stats

    stats = get_or_create_stats(db, user.id)
    return {
        "user": auth_service.serialise_user(user, include_private=True),
        "stats": serialise_stats(stats),
    }


def _set_refresh_cookie(response: Response, token: str) -> None:
    """
    The refresh token lives in an HttpOnly, SameSite=Strict cookie so it is
    unreachable from JavaScript (mitigates XSS token theft). The access token
    is returned in the body and held in memory by the SPA.
    """
    from app.config import settings

    response.set_cookie(
        key="hobbylog_refresh",
        value=token,
        httponly=True,
        samesite="strict",
        secure=settings.is_production,
        max_age=settings.refresh_token_expire_days * 86400,
        path="/api/auth",
    )
