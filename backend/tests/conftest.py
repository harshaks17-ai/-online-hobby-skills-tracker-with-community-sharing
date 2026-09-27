"""
Shared fixtures for the backend test suite.

The suite mounts the *real* FastAPI app in-process (starlette's TestClient) but
points it at a throw-away SQLite file and a throw-away object-storage directory
created under the system temp dir. Nothing here can touch the developer's
running database at ``backend/data/hobbylog.db`` or the bucket at
``backend/storage`` - which also means the suite can run at the same time as
``python run.py``.

The environment must be set *before* the first ``app.*`` import, because both
the SQLAlchemy engine and the object-storage root are resolved at import time.
"""

from __future__ import annotations

import io
import os
import tempfile
import uuid
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="hobbylog-pytest-"))

os.environ.update(
    {
        "ENVIRONMENT": "local",
        "SQLITE_PATH": str(_TMP / "hobbylog.db"),
        "STORAGE_ROOT": str(_TMP / "storage"),
        "SECRET_KEY": "pytest-only-secret-0123456789abcdef0123456789abcdef",
        "SEED_ON_STARTUP": "true",
        # The suite registers dozens of accounts in a few seconds; the limiter
        # itself has a dedicated test (test_security.py::test_rate_limiter).
        "AUTH_RATE_LIMIT_REQUESTS": "100000",
        "RATE_LIMIT_REQUESTS": "1000000",
    }
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

#: Every test account gets this password unless it asks for another.
PASSWORD = "Password123"


@pytest.fixture(scope="session")
def client() -> TestClient:
    """One application instance (and therefore one lifespan) for the suite."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def register_account(client):
    """Factory for a fresh, fully signed-in account."""

    def _register(password: str = PASSWORD) -> dict:
        suffix = uuid.uuid4().hex[:10]
        body = {
            "name": f"Tester {suffix}",
            "username": f"t{suffix}",
            "email": f"{suffix}@test.com",
            "password": password,
        }
        response = client.post("/api/auth/register", json=body)
        assert response.status_code == 201, response.text
        payload = response.json()
        return {
            "user": payload["user"],
            "token": payload["tokens"]["access_token"],
            "refresh": payload["tokens"]["refresh_token"],
            "headers": {"Authorization": f"Bearer {payload['tokens']['access_token']}"},
            "password": password,
            "username": body["username"],
            "email": body["email"],
        }

    return _register


@pytest.fixture()
def account(register_account) -> dict:
    """The primary account under test."""
    return register_account()


@pytest.fixture()
def other(register_account) -> dict:
    """A second, unrelated account - used for authorization tests."""
    return register_account()


@pytest.fixture()
def skill(client, account) -> dict:
    """A skill owned by ``account``."""
    response = client.post(
        "/api/skills",
        json={
            "title": "Pytest Photography",
            "category": "photography",
            "description": "Created by the pytest suite.",
            "goal_per_week": 120,
            "minutes_per_session": 30,
            "accent": "violet",
            "icon": "\U0001f4f7",
        },
        headers=account["headers"],
    )
    assert response.status_code == 201, response.text
    return response.json()


def png_bytes(width: int = 8, height: int = 8) -> bytes:
    """A genuinely valid PNG (Pillow writes the chunks for us)."""
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (99, 102, 241)).save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.fixture()
def upload_png(client, account):
    """Upload an image and return the stored object as the API serialises it."""

    def _upload(
        filename: str = "proof.png",
        content: bytes | None = None,
        mime: str = "image/png",
        scope: str = "proof",
        visibility: str = "public",
    ) -> dict:
        response = client.post(
            "/api/files/upload",
            files={"file": (filename, content or png_bytes(), mime)},
            data={"scope": scope, "visibility": visibility},
            headers=account["headers"],
        )
        assert response.status_code == 201, response.text
        return response.json()

    return _upload
