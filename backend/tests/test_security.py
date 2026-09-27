"""Security controls: rate limiting, headers, envelopes and privacy."""

from __future__ import annotations

import json

from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from app.middleware.request_context import RateLimitMiddleware


def _ok(request):
    return JSONResponse({"ok": True})


def _build_limited_app(requests: int, window: int) -> Starlette:
    limited = Starlette(routes=[Route("/api/limited", _ok)])
    limited.add_middleware(RateLimitMiddleware, requests=requests, window=window)
    return limited


def test_rate_limiter_returns_429_after_the_budget_is_spent():
    with TestClient(_build_limited_app(requests=2, window=60)) as limited:
        assert limited.get("/api/limited").status_code == 200
        assert limited.get("/api/limited").status_code == 200
        blocked = limited.get("/api/limited")

    assert blocked.status_code == 429
    assert blocked.headers.get("retry-after")
    body = json.loads(blocked.content)
    assert body["error"]["code"] == "rate_limited"
    assert set(body["error"]) >= {"code", "message", "details"}


def test_public_api_paths_share_one_budget_per_client():
    """Only auth endpoints get their own per-path bucket; everything else shares."""
    app = Starlette(routes=[Route("/api/one", _ok), Route("/api/two", _ok)])
    app.add_middleware(RateLimitMiddleware, requests=1, window=60)
    with TestClient(app) as limited:
        assert limited.get("/api/one").status_code == 200
        assert limited.get("/api/one").status_code == 429
        assert limited.get("/api/two").status_code == 429


def test_auth_endpoints_keep_their_own_budget_when_the_public_one_is_spent():
    app = Starlette(routes=[Route("/api/one", _ok), Route("/api/auth/login", _ok)])
    app.add_middleware(RateLimitMiddleware, requests=1, window=60)
    with TestClient(app) as limited:
        assert limited.get("/api/one").status_code == 200
        assert limited.get("/api/one").status_code == 429
        # Sign-in is bucketed separately, so it is not starved by page traffic.
        assert limited.get("/api/auth/login").status_code == 200


def test_rate_limiter_ignores_non_api_paths():
    app = Starlette(routes=[Route("/", _ok)])
    app.add_middleware(RateLimitMiddleware, requests=1, window=60)
    with TestClient(app) as limited:
        for _ in range(5):
            assert limited.get("/").status_code == 200


def test_security_headers_are_present_on_every_response(client):
    response = client.get("/api/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"]
    assert "content-security-policy" in {k.lower() for k in response.headers}
    assert response.headers.get("x-request-id")


def test_errors_share_one_envelope(client, account):
    body = client.get("/api/skills/definitely-not-a-skill", headers=account["headers"]).json()
    assert set(body["error"]) == {"code", "message", "details"}
    assert isinstance(body["error"]["details"], dict)


def test_validation_errors_are_422(client, account):
    response = client.post(
        "/api/practice",
        json={"skill_id": "abcd", "duration_minutes": 0},
        headers=account["headers"],
    )
    assert response.status_code == 422
    assert "detail" in response.json()


def test_public_profile_never_returns_an_email(client, account):
    profile = client.get(f"/api/users/{account['username']}")
    assert profile.status_code == 200
    assert account["email"] not in profile.text
    assert "email" not in profile.json()["user"]
    assert "email" not in client.get("/api/community/stats").text
    assert "email" not in client.get("/api/meta/config").text


def test_no_response_contains_a_password_hash(client, account):
    for path in (
        "/api/auth/me",
        f"/api/users/{account['username']}",
        "/api/community/stats",
        "/api/feed",
    ):
        text = client.get(path, headers=account["headers"]).text.lower()
        assert "pbkdf2" not in text
        assert "password_hash" not in text
        assert "pass1234" not in text


def test_static_media_responses_are_not_interactive(client, upload_png):
    uploaded = upload_png()
    headers = client.get(uploaded["url"]).headers
    assert headers.get("x-content-type-options") == "nosniff"
