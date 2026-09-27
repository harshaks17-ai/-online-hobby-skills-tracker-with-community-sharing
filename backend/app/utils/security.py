"""
Security primitives implemented on the Python standard library only.

Why no third-party crypto here?
    A course project that must run anywhere benefits from having *zero* native
    build steps. PBKDF2-HMAC-SHA256 (`hashlib.pbkdf2_hmac`) and HMAC-SHA256
    (`hmac`) are FIPS-approved primitives available in every CPython build, so
    password hashing and token signing cannot be broken by a dependency bump.

Production note
    On a managed cloud you would delegate both of these to the platform:
    * password hashing -> Firebase Authentication / Cognito (bcrypt/argon2,
      breached-password screening, MFA, rate limiting, session revocation)
    * token signing     -> Identity-Aware Proxy / API Gateway authorizers
    The rest of the application only consumes the resulting claims, which is why
    the interface below is a drop-in for that migration (see cloud/auth_service.py).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from app.config import settings

# --------------------------------------------------------------------- PBKDF2
_ALGO = "pbkdf2_sha256"
_ITERATIONS = 210_000          # OWASP 2023 guidance for PBKDF2-HMAC-SHA256
_SALT_BYTES = 16


def hash_password(password: str) -> str:
    """Return `pbkdf2_sha256$iterations$salt_hex$hash_hex`."""
    if not isinstance(password, str) or len(password) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    if len(password) > 256:
        raise ValueError("Password must be at most 256 characters long.")
    salt = os.urandom(_SALT_BYTES)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    return f"{_ALGO}${_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Constant-time verification that never raises on malformed input."""
    try:
        algo, iterations, salt_hex, hash_hex = stored.split("$")
        if algo != _ALGO:
            return False
        expected = bytes.fromhex(hash_hex)
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(expected, candidate)
    except (ValueError, AttributeError, TypeError):
        return False


# ------------------------------------------------------------------------ JWT
def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


class TokenError(Exception):
    """Raised for any malformed / expired / tampered token."""


def _encode_segment(segment: dict[str, Any]) -> str:
    return _b64url_encode(
        json.dumps(segment, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )


def _sign(signing_input: bytes) -> str:
    signature = hmac.new(
        settings.secret_key.encode("utf-8"), signing_input, hashlib.sha256
    ).digest()
    return _b64url_encode(signature)


def create_token(
    subject: str,
    token_type: str = "access",
    expires_delta: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Mint a signed JWT (HS256). `alg` is pinned - never read from the token."""
    if expires_delta is None:
        expires_delta = (
            timedelta(minutes=settings.access_token_expire_minutes)
            if token_type == "access"
            else timedelta(days=settings.refresh_token_expire_days)
        )
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "typ": token_type,
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
        "jti": uuid.uuid4().hex,
        "iss": "hobbylog.cloud",
    }
    if extra_claims:
        payload.update(extra_claims)
    header = _encode_segment({"alg": settings.jwt_algorithm, "typ": "JWT"})
    body = _encode_segment(payload)
    signing_input = f"{header}.{body}".encode("ascii")
    return f"{header}.{body}.{_sign(signing_input)}"


def decode_token(token: str, expected_type: str | None = "access") -> dict[str, Any]:
    """Verify signature, algorithm, not-before and expiry. Raises `TokenError`."""
    if not token or token.count(".") != 2:
        raise TokenError("Malformed token.")
    header_b64, body_b64, signature_b64 = token.split(".")
    try:
        header = json.loads(_b64url_decode(header_b64))
        payload = json.loads(_b64url_decode(body_b64))
        signature = _b64url_decode(signature_b64)
    except (ValueError, json.JSONDecodeError) as exc:
        raise TokenError("Malformed token.") from exc

    if header.get("alg") != settings.jwt_algorithm:
        raise TokenError("Unsupported token algorithm.")
    if header.get("typ") != "JWT":
        raise TokenError("Unsupported token type.")

    expected_signature = hmac.new(
        settings.secret_key.encode("utf-8"),
        f"{header_b64}.{body_b64}".encode("ascii"),
        hashlib.sha256,
    ).digest()
    if not hmac.compare_digest(expected_signature, signature):
        raise TokenError("Invalid token signature.")

    now = int(datetime.now(timezone.utc).timestamp())
    if payload.get("nbf", 0) > now + 5:
        raise TokenError("Token is not yet valid.")
    if payload.get("exp", 0) <= now:
        raise TokenError("Token has expired.")
    if expected_type and payload.get("typ") != expected_type:
        raise TokenError(f"Expected a {expected_type} token.")
    if not payload.get("sub"):
        raise TokenError("Token is missing a subject.")
    return payload


# ----------------------------------------------------------------- utilities
def generate_referral_code() -> str:
    return secrets.token_hex(6)


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))
