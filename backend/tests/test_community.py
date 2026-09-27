"""Community sharing: posts, feed, likes, comments, follows and deletion."""

from __future__ import annotations


def test_sharing_a_post_puts_it_in_the_feed(client, account, skill):
    post = client.post(
        "/api/posts",
        json={"content": "Logged a session today.", "skill_id": skill["id"]},
        headers=account["headers"],
    )
    assert post.status_code == 201, post.text
    post_id = post.json()["id"]

    feed = client.get("/api/feed", headers=account["headers"]).json()
    assert any(item["id"] == post_id for item in feed["items"])
    assert "has_next" in feed and "total" in feed


def test_feed_search_filters_the_results(client, account):
    token_text = f"needle-{__import__('uuid').uuid4().hex[:8]}"
    client.post(
        "/api/posts",
        json={"content": f"Finding {token_text} in the haystack."},
        headers=account["headers"],
    )
    hit = client.get(f"/api/feed?search={token_text}", headers=account["headers"]).json()
    assert hit["total"] >= 1
    miss = client.get("/api/feed?search=zzz-no-such-text-zzz", headers=account["headers"]).json()
    assert miss["total"] == 0


def test_empty_post_is_rejected(client, account):
    response = client.post("/api/posts", json={"content": ""}, headers=account["headers"])
    assert response.status_code == 422


def test_like_counts_once_and_a_duplicate_is_refused(client, account, other):
    post = client.post(
        "/api/posts",
        json={"content": "Please like this."},
        headers=account["headers"],
    ).json()

    liked = client.post(f"/api/posts/{post['id']}/like", headers=other["headers"])
    assert liked.status_code == 201
    assert liked.json()["likes_count"] == 1

    duplicate = client.post(f"/api/posts/{post['id']}/like", headers=other["headers"])
    assert duplicate.status_code == 409

    unliked = client.delete(f"/api/posts/{post['id']}/like", headers=other["headers"])
    assert unliked.status_code == 200
    assert unliked.json()["likes_count"] == 0


def test_comment_lifecycle(client, account, other):
    post = client.post(
        "/api/posts",
        json={"content": "Comments welcome."},
        headers=account["headers"],
    ).json()

    comment = client.post(
        f"/api/posts/{post['id']}/comments",
        json={"content": "Nice work!"},
        headers=other["headers"],
    )
    assert comment.status_code == 201, comment.text
    comment_id = comment.json()["id"]

    listed = client.get(f"/api/posts/{post['id']}/comments", headers=account["headers"]).json()
    assert any(item["id"] == comment_id for item in listed["items"])

    # The author of a comment and the author of the post may both remove it.
    assert client.delete(f"/api/comments/{comment_id}", headers=other["headers"]).status_code == 200
    after = client.get(f"/api/posts/{post['id']}/comments", headers=account["headers"]).json()
    assert all(item["id"] != comment_id for item in after["items"])


def test_only_the_owner_can_edit_or_delete_a_post(client, account, other):
    post = client.post(
        "/api/posts",
        json={"content": "Mine to edit."},
        headers=account["headers"],
    ).json()

    # Editing is scoped, so a stranger simply does not see the post (404).
    edit_attempt = client.put(
        f"/api/posts/{post['id']}",
        json={"content": "Hijacked!"},
        headers=other["headers"],
    )
    assert edit_attempt.status_code == 404
    assert edit_attempt.json()["error"]["code"] == "post_not_found"

    # Deleting is an explicit ownership check.
    delete_attempt = client.delete(f"/api/posts/{post['id']}", headers=other["headers"])
    assert delete_attempt.status_code == 422
    assert delete_attempt.json()["error"]["code"] == "not_post_owner"

    edited = client.put(
        f"/api/posts/{post['id']}",
        json={"content": "Edited by the author."},
        headers=account["headers"],
    )
    assert edited.status_code == 200
    assert edited.json()["content"] == "Edited by the author."

    assert client.delete(f"/api/posts/{post['id']}", headers=account["headers"]).status_code == 200
    assert client.get(f"/api/posts/{post['id']}", headers=account["headers"]).status_code == 404


def test_follow_unfollow_and_self_follow(client, account, other):
    username = other["username"]

    followed = client.post(f"/api/users/{username}/follow", headers=account["headers"])
    assert followed.status_code == 200

    duplicate = client.post(f"/api/users/{username}/follow", headers=account["headers"])
    assert duplicate.status_code == 409

    assert client.delete(f"/api/users/{username}/follow", headers=account["headers"]).status_code == 200

    self_follow = client.post(f"/api/users/{account['username']}/follow", headers=account["headers"])
    assert self_follow.status_code == 422


def test_following_feed_is_scoped_to_people_you_follow(client, account, other, skill):
    client.post(f"/api/users/{account['username']}/follow", headers=other["headers"])

    client.post(
        "/api/posts",
        json={"content": "From the people you follow."},
        headers=account["headers"],
    )

    following_feed = client.get("/api/feed?scope=following", headers=other["headers"]).json()
    assert following_feed["total"] >= 1

    unfollowed = client.delete(f"/api/users/{account['username']}/follow", headers=other["headers"])
    assert unfollowed.status_code == 200
    after = client.get("/api/feed?scope=following", headers=other["headers"]).json()
    assert all(item["author"]["username"] != account["username"] for item in after["items"])


def test_public_profile_hides_the_email_but_shows_activity(client, account, skill):
    body = client.get(f"/api/users/{account['username']}").json()
    profile = body["user"]
    assert "email" not in profile
    assert profile["username"] == account["username"]
    assert body["is_self"] is False
    assert any(item["id"] == skill["id"] for item in body["skills"])


def test_deleting_an_account_removes_it_from_the_platform(client, register_account):
    doomed = register_account()
    post = client.post(
        "/api/posts",
        json={"content": "About to be deleted."},
        headers=doomed["headers"],
    ).json()

    deleted = client.delete("/api/users/me", headers=doomed["headers"])
    assert deleted.status_code == 200
    assert client.get("/api/auth/me", headers=doomed["headers"]).status_code == 401
    assert client.get(f"/api/posts/{post['id']}").status_code in (403, 404)


def test_endpoints_reject_anonymous_callers(client, account):
    post = client.post("/api/posts", json={"content": "Auth required."}, headers=account["headers"]).json()
    assert client.post("/api/posts", json={"content": "anon"}).status_code == 401
    assert client.post(f"/api/posts/{post['id']}/like").status_code == 401
    assert client.delete("/api/users/me").status_code == 401
