"""Progress analytics: dashboard payload, badge catalogue, portable export."""

from __future__ import annotations


def _log(client, account, skill, minutes: int) -> None:
    response = client.post(
        "/api/practice",
        json={"skill_id": skill["id"], "duration_minutes": minutes},
        headers=account["headers"],
    )
    assert response.status_code == 201, response.text


def test_dashboard_returns_headline_and_every_chart(client, account, skill):
    _log(client, account, skill, 90)
    headers = account["headers"]
    client.post(
        "/api/goals",
        json={"title": "Twenty hours", "skill_id": skill["id"], "target_value": 20, "unit": "hours"},
        headers=headers,
    )

    dashboard = client.get("/api/analytics/dashboard", headers=headers)
    assert dashboard.status_code == 200
    body = dashboard.json()
    assert "charts" in body and "headline" in body

    charts = body["charts"]
    for key in ("by_skill", "weekly_trend", "daily_30", "heatmap", "distribution", "goal_progress", "activity_by_hour"):
        assert charts.get(key), f"chart '{key}' is empty"

    assert body["headline"]["total_hours"] == 1.5
    assert body["headline"]["total_minutes"] == 90


def test_dashboard_never_leaks_another_users_numbers(client, account, skill, other):
    _log(client, account, skill, 120)
    dashboard = client.get("/api/analytics/dashboard", headers=other["headers"])
    assert dashboard.status_code == 200
    assert dashboard.json()["headline"]["total_minutes"] == 0


def test_goal_progress_chart_reflects_logged_sessions(client, account, skill):
    _log(client, account, skill, 90)
    headers = account["headers"]
    client.post(
        "/api/goals",
        json={"title": "Twenty hours", "skill_id": skill["id"], "target_value": 20, "unit": "hours"},
        headers=headers,
    )
    charts = client.get("/api/analytics/dashboard", headers=headers).json()["charts"]
    assert any(abs(goal["progress_percent"] - 7.5) < 0.6 for goal in charts["goal_progress"])


def test_badge_catalogue_has_ten_entries(client, account):
    body = client.get("/api/analytics/badges", headers=account["headers"]).json()
    assert len(body["items"]) == 10
    assert all("code" in badge for badge in body["items"])


def test_levels_endpoint_reports_skill_distribution(client, account, skill):
    body = client.get("/api/analytics/levels", headers=account["headers"]).json()
    assert "items" in body
    assert any(item["count"] >= 1 for item in body["items"])


def test_export_is_portable_and_never_leaks_the_password_hash(client, account, skill):
    _log(client, account, skill, 45)
    response = client.get("/api/analytics/export", headers=account["headers"])
    assert response.status_code == 200
    text = response.text.lower()
    assert "password" not in text
    assert "pbkdf2" not in text
    payload = response.json()
    assert "skills" in payload or "sessions" in payload


def test_dashboard_requires_a_token(client):
    assert client.get("/api/analytics/dashboard").status_code == 401
    assert client.get("/api/analytics/export").status_code == 401
