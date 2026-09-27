"""
Cloud identity service (authentication / authorization seam).

Local provider
--------------
Self-issued HS256 JWTs. Verification is stateless, which is exactly the property
you want from a managed IdP too: any API replica can validate a token without a
database round-trip or a sticky session.

Managed equivalents
-------------------
* GCP  -> Firebase Authentication / Identity Platform  (OIDC id tokens)
* AWS  -> Cognito (JWT with RS256, JWKS endpoint, refresh-token rotation)
* Azure-> Microsoft Entra ID

`verify_identity_token()` is the single entry point the routers use, so moving
to Firebase Auth means changing this file plus the login route - no feature
module is affected. See the Firebase migration note at the bottom.
"""

from __future__ import annotations

from typing import Any

from app.config import settings
from app.utils.security import TokenError, decode_token, verify_password


def authenticate_credentials(email: str, password: str, password_hash: str) -> bool:
    """Constant-time password check. Never reveals *which* half was wrong."""
    return verify_password(password, password_hash)


def verify_identity_token(token: str) -> dict[str, Any]:
    """
    Validate a bearer token and return its claims.

    Raises `TokenError` for expired / tampered / malformed tokens, which the
    `require_user` dependency maps to HTTP 401.
    """
    return decode_token(token, expected_type="access")


def describe_identity_provider() -> dict[str, Any]:
    return {
        "service": "Cloud Identity / Authentication",
        "provider": settings.identity_provider,
        "token_format": "JWT (HS256)",
        "access_token_ttl_minutes": settings.access_token_expire_minutes,
        "refresh_token_ttl_days": settings.refresh_token_expire_days,
        "features": [
            "stateless verification (horizontally scalable API)",
            "constant-time password comparison",
            "PBKDF2-HMAC-SHA256 password hashing (210k iterations)",
            "refresh-token rotation on the client",
            "role claim for moderator authorisation",
        ],
    }


# --------------------------------------------------------------------------- #
# Firebase migration note
# --------------------------------------------------------------------------- #
# To swap in Firebase Authentication:
#
#   npm i firebase                       # in frontend/
#   import { initializeApp } from "firebase/app";
#   import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
#
#   const token = await signInWithEmailAndPassword(auth, email, password)
#                        .then(s => s.user.getIdToken());
#
#   # Backend: verify the RS256 id-token with the project's JWKS instead of the
#   # local HMAC above, and keep a `users` table for the application profile.
#
#   pip install firebase-admin            # admin SDK for user management
#
# The route signatures, the request bodies and the React components stay
# byte-for-byte identical - only token minting/verification moves to the cloud.
