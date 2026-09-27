"""Deployment shape: health, architecture, public configuration, static media."""

from __future__ import annotations

from pathlib import Path

from app.config import settings

REQUIRED_LAYERS = (
    "presentation",
    "edge",
    "application",
    "identity",
    "data",
    "object storage",
    "compute",
    "observability",
)


def test_root_reports_service_identity(client):
    body = client.get("/").json()
    assert body["service"] == settings.app_name
    assert body["version"] == settings.app_version
    assert body["health"] == f"{settings.api_prefix}/health"
    assert body["docs"] == "/docs"


def test_health_is_green_with_both_dependencies(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert body["dependencies"]["database"]["healthy"] is True
    assert body["dependencies"]["storage"]["healthy"] is True
    assert body["dependencies"]["database"]["provider"]


def test_openapi_document_is_served(client):
    document = client.get("/openapi.json").json()
    assert document["openapi"].startswith("3.")
    assert "/api/auth/login" in document["paths"]


def test_architecture_describes_every_required_layer(client):
    layers = client.get("/api/meta/architecture").json()["layers"]
    assert len(layers) >= 7
    for layer in layers:
        assert layer["name"] and layer["responsibility"]
    haystack = " ".join(layer["name"].lower() for layer in layers)
    for expected in REQUIRED_LAYERS:
        assert expected in haystack, f"architecture does not mention '{expected}'"


def test_public_config_exposes_providers_but_no_secrets(client):
    response = client.get("/api/meta/config")
    body = response.json()
    assert body["providers"]["database"]
    assert body["providers"]["storage"]
    assert body["providers"]["identity"]
    lowered = response.text.lower()
    assert "secret" not in lowered
    assert "pass1234" not in lowered
    assert "pbkdf2" not in lowered


def test_community_stats_are_public(client):
    response = client.get("/api/community/stats")
    body = response.json()
    assert set(body) == {"users", "sessions", "practice_hours", "posts", "skills", "goals"}
    assert body["users"] >= 8
    assert body["sessions"] > 0
    assert "password" not in response.text.lower()


def test_backend_does_not_serve_its_own_dotenv(client):
    """Regression: a blank STORAGE_ROOT used to resolve to the backend tree."""
    assert client.get("/media/.env").status_code == 404
    assert client.get("/media/../.env").status_code == 404
    root = Path(settings.resolved_storage_root)
    assert root.name == "storage"
    assert not (root / ".env").exists()


def test_known_routes_use_the_shared_error_envelope(client, account):
    body = client.get("/api/skills/definitely-not-a-skill", headers=account["headers"]).json()
    assert set(body["error"]) >= {"code", "message", "details"}
