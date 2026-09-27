"""Skill CRUD, validation and ownership boundaries."""

from __future__ import annotations


def test_create_returns_a_serialised_skill(client, account, skill):
    assert skill["title"] == "Pytest Photography"
    assert skill["category"] == "photography"
    assert skill["user_id"] == account["user"]["id"]
    assert skill["is_public"] is True


def test_new_accounts_get_a_starter_skill(client, account):
    body = client.get("/api/skills", headers=account["headers"]).json()
    assert body["total"] >= 1
    assert all(item["title"] for item in body["items"])


def test_list_is_scoped_to_the_signed_in_user(client, skill, other):
    mine = {item["id"] for item in client.get("/api/skills", headers=other["headers"]).json()["items"]}
    assert skill["id"] not in mine


def test_duplicate_title_within_an_account_is_refused(client, account, skill):
    response = client.post(
        "/api/skills",
        json={"title": skill["title"], "category": "photography"},
        headers=account["headers"],
    )
    assert response.status_code == 409


def test_title_needs_at_least_two_characters(client, account):
    response = client.post(
        "/api/skills",
        json={"title": "x", "category": "other"},
        headers=account["headers"],
    )
    assert response.status_code == 422
    assert "detail" in response.json() or "error" in response.json()


def test_unknown_fields_are_rejected(client, account):
    response = client.post(
        "/api/skills",
        json={"title": "Strict Schema", "category": "other", "is_public": True},
        headers=account["headers"],
    )
    assert response.status_code == 422


def test_update_changes_the_fields_it_is_given(client, account, skill):
    response = client.put(
        f"/api/skills/{skill['id']}",
        json={"description": "Rewritten by the test suite.", "goal_per_week": 240},
        headers=account["headers"],
    )
    assert response.status_code == 200
    body = response.json()
    assert body["description"] == "Rewritten by the test suite."
    assert body["goal_per_week"] == 240
    assert body["title"] == skill["title"]


def test_delete_removes_the_skill(client, account, skill):
    deleted = client.delete(f"/api/skills/{skill['id']}", headers=account["headers"])
    assert deleted.status_code == 200
    assert client.get(f"/api/skills/{skill['id']}", headers=account["headers"]).status_code == 404


def test_a_skill_is_readable_but_only_the_owner_can_edit_it(client, skill, other):
    readable = client.get(f"/api/skills/{skill['id']}", headers=other["headers"])
    assert readable.status_code == 200
    assert readable.json()["skill"]["id"] == skill["id"]

    edit = client.put(
        f"/api/skills/{skill['id']}",
        json={"title": "Hijacked"},
        headers=other["headers"],
    )
    assert edit.status_code == 403
    assert edit.json()["error"]["code"] == "not_skill_owner"


def test_another_user_cannot_delete_someone_elses_skill(client, account, skill, other):
    response = client.delete(f"/api/skills/{skill['id']}", headers=other["headers"])
    assert response.status_code in (403, 404)
    assert client.get(f"/api/skills/{skill['id']}", headers=account["headers"]).status_code == 200


def test_category_catalogue_is_public(client):
    body = client.get("/api/skills/categories").json()
    assert len(body["items"]) >= 8
    assert "music" in body["items"]


def test_endpoints_reject_anonymous_callers(client):
    assert client.get("/api/skills").status_code == 401
    assert client.post("/api/skills", json={"title": "Nope", "category": "other"}).status_code == 401
