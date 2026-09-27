"""The seeded demo accounts that the report and README document."""

from __future__ import annotations

from app.config import settings
from app.database import session_scope
from app.models import Skill, User
from app.seed import seed_if_empty

DEMO_ACCOUNTS = [
    ("user@test.com", "demo"),
    ("aisha@test.com", "aisha"),
    ("dev@test.com", "devansh"),
    ("marco@test.com", "marco"),
    ("yuki@test.com", "yuki"),
    ("leo@test.com", "leo"),
    ("sam@test.com", "sam"),
    ("moderator@test.com", "mod_nadia"),
]


def test_the_documented_demo_password_is_stable():
    assert settings.demo_password == "pass1234"


def test_every_documented_demo_account_signs_in(client):
    for email, _ in DEMO_ACCOUNTS:
        response = client.post("/api/auth/login", json={"email": email, "password": "pass1234"})
        assert response.status_code == 200, f"{email} could not sign in: {response.text}"


def test_the_wrong_password_is_refused_for_a_demo_account(client):
    response = client.post("/api/auth/login", json={"email": "user@test.com", "password": "not-the-password"})
    assert response.status_code == 401


def test_seed_creates_the_expected_people_and_they_are_public(client):
    for email, username in DEMO_ACCOUNTS:
        profile = client.get(f"/api/users/{username}")
        assert profile.status_code == 200, f"{username} has no public profile"
        assert "email" not in profile.json()["user"]
        assert profile.json()["user"]["username"] == username


def test_seeded_users_have_skills_to_look_at(client):
    response = client.get("/api/skills/discover")
    assert response.status_code == 200
    assert len(response.json()["items"]) >= 5


def test_seeding_is_idempotent():
    with session_scope() as db:
        before = (db.query(User).count(), db.query(Skill).count())

    assert seed_if_empty() is False

    with session_scope() as db:
        after = (db.query(User).count(), db.query(Skill).count())

    assert after == before
    assert before[0] >= len(DEMO_ACCOUNTS)
