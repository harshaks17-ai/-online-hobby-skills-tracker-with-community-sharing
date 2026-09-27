"""Practice sessions: logging, streaks, badges, filters and validation."""

from __future__ import annotations

import uuid


def test_first_session_starts_a_streak_and_awards_a_badge(client, account, skill):
    response = client.post(
        "/api/practice",
        json={"skill_id": skill["id"], "duration_minutes": 60, "notes": "Golden hour."},
        headers=account["headers"],
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["stats"]["current_streak"] == 1
    assert body["stats"]["total_minutes"] == 60
    assert any(badge["code"] == "first_log" for badge in body["new_badges"])


def test_a_second_session_same_day_extends_total_not_streak(client, account, skill):
    headers = account["headers"]
    client.post("/api/practice", json={"skill_id": skill["id"], "duration_minutes": 60}, headers=headers)
    response = client.post(
        "/api/practice",
        json={"skill_id": skill["id"], "duration_minutes": 30},
        headers=headers,
    )
    assert response.status_code == 201
    assert response.json()["stats"]["total_minutes"] == 90
    assert response.json()["stats"]["current_streak"] == 1

    streak = client.get("/api/practice/streak", headers=headers).json()
    assert streak["current_streak"] >= 1
    assert streak["practiced_today"] is True


def test_history_can_be_filtered_by_skill(client, account, skill):
    headers = account["headers"]
    other_skill = client.post(
        "/api/skills",
        json={"title": "Ukulele", "category": "music"},
        headers=headers,
    ).json()
    client.post("/api/practice", json={"skill_id": skill["id"], "duration_minutes": 20}, headers=headers)
    client.post("/api/practice", json={"skill_id": other_skill["id"], "duration_minutes": 45}, headers=headers)

    filtered = client.get(f"/api/practice?skill_id={skill['id']}", headers=headers).json()
    assert filtered["total"] == 1
    assert filtered["items"][0]["skill_id"] == skill["id"]

    by_skill = client.get(f"/api/practice/by-skill/{skill['id']}", headers=headers).json()
    assert by_skill["total"] == 1


def test_history_is_scoped_to_the_signed_in_user(client, account, skill, other):
    client.post(
        "/api/practice",
        json={"skill_id": skill["id"], "duration_minutes": 55},
        headers=account["headers"],
    )
    assert client.get("/api/practice", headers=other["headers"]).json()["total"] == 0


def test_zero_minute_session_is_rejected(client, account, skill):
    response = client.post(
        "/api/practice",
        json={"skill_id": skill["id"], "duration_minutes": 0},
        headers=account["headers"],
    )
    assert response.status_code == 422


def test_practising_a_skill_you_do_not_own_is_refused(client, account, other):
    other_skill = client.post(
        "/api/skills",
        json={"title": "Someone Elses", "category": "other"},
        headers=other["headers"],
    ).json()
    response = client.post(
        "/api/practice",
        json={"skill_id": other_skill["id"], "duration_minutes": 30},
        headers=account["headers"],
    )
    assert response.status_code in (403, 404)


def test_session_can_be_edited_then_deleted(client, account, skill):
    headers = account["headers"]
    created = client.post(
        "/api/practice",
        json={"skill_id": skill["id"], "duration_minutes": 30},
        headers=headers,
    )
    assert created.status_code == 201
    session_id = created.json()["session"]["id"]

    edited = client.put(
        f"/api/practice/{session_id}",
        json={"duration_minutes": 45, "notes": "Longer than planned."},
        headers=headers,
    )
    assert edited.status_code == 200
    assert edited.json()["duration_minutes"] == 45

    assert client.delete(f"/api/practice/{session_id}", headers=headers).status_code == 200
    assert client.get(f"/api/practice/{session_id}", headers=headers).status_code == 404


def test_an_idempotency_key_does_not_break_logging(client, account, skill):
    headers = account["headers"]
    payload = {
        "skill_id": skill["id"],
        "duration_minutes": 25,
        "idempotency_key": uuid.uuid4().hex,
    }
    response = client.post("/api/practice", json=payload, headers=headers)
    assert response.status_code == 201
    body = response.json()
    assert body["session"]["id"]
    assert body["stats"]["total_minutes"] == 25


def test_practice_requires_authentication(client, skill):
    assert client.post("/api/practice", json={"skill_id": skill["id"], "duration_minutes": 10}).status_code == 401
    assert client.get("/api/practice").status_code == 401
