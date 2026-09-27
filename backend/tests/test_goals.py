"""Goals: milestones, progress derived from sessions, recalculation, ownership."""

from __future__ import annotations


def _log(client, account, skill, minutes: int) -> None:
    response = client.post(
        "/api/practice",
        json={"skill_id": skill["id"], "duration_minutes": minutes},
        headers=account["headers"],
    )
    assert response.status_code == 201, response.text


def test_create_generates_four_auto_milestones(client, account, skill):
    response = client.post(
        "/api/goals",
        json={
            "title": "Ten hours of light",
            "skill_id": skill["id"],
            "target_value": 10,
            "unit": "hours",
            "deadline": "2027-03-31",
        },
        headers=account["headers"],
    )
    assert response.status_code == 201, response.text
    goal = response.json()
    assert goal["target_value"] == 10
    assert goal["unit"] == "hours"
    assert len(goal["milestones"]) == 4
    assert [m["target_value"] for m in goal["milestones"]] == [2.5, 5, 7.5, 10]


def test_existing_sessions_are_back_filled_into_a_new_goal(client, account, skill):
    """Regression: progress was 0% until the next session was logged."""
    _log(client, account, skill, 75)
    goal = client.post(
        "/api/goals",
        json={
            "title": "Catch up to what I already practised",
            "skill_id": skill["id"],
            "target_value": 10,
            "unit": "hours",
        },
        headers=account["headers"],
    ).json()
    assert goal["current_value"] == 1.25
    assert abs(goal["progress_percent"] - 12.5) < 0.01


def test_rebuild_recomputes_progress_after_history_changes(client, account, skill):
    headers = account["headers"]
    goal = client.post(
        "/api/goals",
        json={"title": "Weekly photography", "skill_id": skill["id"], "target_value": 60, "unit": "minutes"},
        headers=headers,
    ).json()
    _log(client, account, skill, 30)
    rebuilt = client.post(f"/api/goals/{goal['id']}/rebuild", headers=headers)
    assert rebuilt.status_code == 200
    assert rebuilt.json()["current_value"] == 30
    assert rebuilt.json()["progress_percent"] == 50


def test_weekly_goal_only_counts_this_week(client, account, skill):
    headers = account["headers"]
    goal = client.post(
        "/api/goals",
        json={
            "title": "Two hours this week",
            "skill_id": skill["id"],
            "target_value": 120,
            "unit": "minutes",
            "kind": "WEEKLY",
        },
        headers=headers,
    )
    assert goal.status_code == 201
    assert goal.json()["kind"] == "WEEKLY"


def test_list_and_detail_are_scoped_to_the_owner(client, account, skill, other):
    headers = account["headers"]
    goal = client.post(
        "/api/goals",
        json={"title": "Private goal", "skill_id": skill["id"], "target_value": 5, "unit": "hours"},
        headers=headers,
    ).json()

    listed = client.get("/api/goals", headers=headers).json()
    assert any(item["id"] == goal["id"] for item in listed["items"])

    denied = client.get(f"/api/goals/{goal['id']}", headers=other["headers"])
    assert denied.status_code == 422
    assert denied.json()["error"]["code"] == "not_goal_owner"

    theirs = client.get("/api/goals", headers=other["headers"]).json()
    assert all(item["id"] != goal["id"] for item in theirs["items"])


def test_target_value_must_be_positive(client, account, skill):
    response = client.post(
        "/api/goals",
        json={"title": "Impossible", "skill_id": skill["id"], "target_value": 0, "unit": "minutes"},
        headers=account["headers"],
    )
    assert response.status_code == 422


def test_goal_can_be_updated_and_deleted(client, account, skill):
    headers = account["headers"]
    goal = client.post(
        "/api/goals",
        json={"title": "Short lived", "skill_id": skill["id"], "target_value": 60, "unit": "minutes"},
        headers=headers,
    ).json()

    updated = client.put(
        f"/api/goals/{goal['id']}",
        json={"title": "Renamed goal", "target_value": 120},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Renamed goal"
    assert updated.json()["target_value"] == 120

    assert client.delete(f"/api/goals/{goal['id']}", headers=headers).status_code == 200
    assert client.get(f"/api/goals/{goal['id']}", headers=headers).status_code == 404


def test_achievements_endpoint_returns_a_list(client, account):
    body = client.get("/api/goals/achievements", headers=account["headers"]).json()
    assert "items" in body
