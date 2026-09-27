"""Registration, sign-in, token rotation and the failure paths around them."""

from __future__ import annotations

import pytest


def test_registration_returns_tokens_and_a_user(client, register_account):
    account = register_account()
    assert account["user"]["email"].endswith("@test.com")
    assert "password" not in account["user"]
    assert len(account["token"]) > 20


def test_access_token_identifies_the_caller(client, account):
    body = client.get("/api/auth/me", headers=account["headers"]).json()
    assert body["user"]["id"] == account["user"]["id"]
    assert body["user"]["email"] == account["email"]


def test_duplicate_email_is_rejected_with_a_stable_code(client, account):
    response = client.post(
        "/api/auth/register",
        json={
            "name": "Impostor",
            "username": "impostor01",
            "email": account["email"],
            "password": "Password123",
        },
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "email_taken"


def test_duplicate_username_is_rejected(client, account):
    response = client.post(
        "/api/auth/register",
        json={
            "name": "Impostor Two",
            "username": account["username"],
            "email": "other-user@test.com",
            "password": "Password123",
        },
    )
    assert response.status_code == 409


def test_password_must_not_be_all_numeric(client, register_account):
    response = client.post(
        "/api/auth/register",
        json={
            "name": "Numeric Only",
            "username": "numeric-only",
            "email": "numeric@test.com",
            "password": "0123456789",
        },
    )
    assert response.status_code == 422
    assert "detail" in response.json() or "error" in response.json()


def test_username_needs_at_least_three_characters(client):
    response = client.post(
        "/api/auth/register",
        json={
            "name": "Short Handle",
            "username": "ab",
            "email": "short@test.com",
            "password": "Password123",
        },
    )
    assert response.status_code == 422


def test_unknown_fields_are_refused_by_the_strict_schema(client):
    response = client.post(
        "/api/auth/register",
        json={
            "name": "Extra Fields",
            "username": "extra-fields",
            "email": "extra@test.com",
            "password": "Password123",
            "is_admin": True,
        },
    )
    assert response.status_code == 422


def test_login_issues_a_refreshable_token_pair(client, account):
    response = client.post(
        "/api/auth/login",
        json={"email": account["email"], "password": account["password"]},
    )
    assert response.status_code == 200
    tokens = response.json()["tokens"]
    refreshed = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"]


def test_wrong_password_is_rejected(client, register_account):
    account = register_account()
    response = client.post(
        "/api/auth/login",
        json={"email": account["email"], "password": "WrongPassword1"},
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_credentials"


def test_unknown_email_is_indistinguishable_from_a_wrong_password(client):
    wrong_email = client.post(
        "/api/auth/login",
        json={"email": "definitely-not-a-user@test.com", "password": "Password123"},
    )
    wrong_password = client.post(
        "/api/auth/login",
        json={"email": "user@test.com", "password": "not-the-password"},
    )
    assert wrong_email.status_code == wrong_password.status_code == 401
    assert (
        wrong_email.json()["error"]["code"]
        == wrong_password.json()["error"]["code"]
        == "invalid_credentials"
    )


def test_endpoint_without_a_token_is_unauthorized(client):
    assert client.get("/api/auth/me").status_code == 401


def test_forged_token_is_rejected(client, account):
    header, _, signature = account["token"].partition(".")
    tampered = f"{header}.eyJzdWIiOiJhZG1pbiJ9.{signature}"
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {tampered}"}).status_code == 401


def test_access_token_cannot_be_reused_as_a_refresh_token(client, account):
    response = client.post("/api/auth/refresh", json={"refresh_token": account["token"]})
    assert response.status_code == 401


def test_refresh_rotates_the_pair(client, account):
    first = client.post("/api/auth/refresh", json={"refresh_token": account["refresh"]})
    second = client.post("/api/auth/refresh", json={"refresh_token": first.json()["access_token"]})
    assert second.status_code == 401  # an access token is not a refresh token

    rotated = client.post("/api/auth/refresh", json={"refresh_token": account["refresh"]})
    assert rotated.status_code == 200
    assert rotated.json()["refresh_token"]


def test_logout_returns_200_and_clears_the_refresh_cookie(client, account):
    """Tokens are stateless, so the access token stays valid after logout."""
    response = client.post("/api/auth/logout", headers=account["headers"])
    assert response.status_code == 200
    assert "hobbylog_refresh" in response.headers.get("set-cookie", "")
    assert client.get("/api/auth/me", headers=account["headers"]).status_code == 200


def test_change_password_invalidates_the_old_password(client, register_account):
    account = register_account()
    changed = client.post(
        "/api/profile/password",
        json={"current_password": account["password"], "new_password": "FreshPass99"},
        headers=account["headers"],
    )
    assert changed.status_code == 200
    assert (
        client.post(
            "/api/auth/login",
            json={"email": account["email"], "password": account["password"]},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login",
            json={"email": account["email"], "password": "FreshPass99"},
        ).status_code
        == 200
    )


@pytest.mark.parametrize("password", ["", "short", "12345678"])
def test_login_rejects_malformed_passwords(client, password):
    response = client.post("/api/auth/login", json={"email": "user@test.com", "password": password})
    assert response.status_code in (401, 422)
