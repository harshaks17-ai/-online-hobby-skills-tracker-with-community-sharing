#!/usr/bin/env python
"""
End-to-end smoke test against a *running* API server.

Unlike `pytest` (which mounts the app in-process), this script talks real HTTP to
http://127.0.0.1:8000 - the same path the browser uses. It is the fastest way to
prove the whole stack is wired up: auth -> skills -> goals -> practice ->
analytics -> storage -> community -> authorization.

    python scripts/smoke_test.py
    python scripts/smoke_test.py --base-url http://127.0.0.1:8000
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

PASSED: list[str] = []
FAILED: list[tuple[str, str]] = []
BASE = "http://127.0.0.1:8000"

GREEN, RED, YELLOW, DIM, BOLD, RESET = (
    "\033[92m", "\033[91m", "\033[93m", "\033[2m", "\033[1m", "\033[0m"
)


def call(method: str, path: str, body=None, token: str | None = None,
         headers: dict | None = None, raw: bytes | None = None,
         content_type: str | None = None) -> tuple[int, dict | bytes]:
    url = f"{BASE}{path}"
    data = None
    hdrs = dict(headers or {})
    if raw is not None:
        data = raw
        if content_type:
            hdrs["Content-Type"] = content_type
    elif body is not None:
        data = json.dumps(body).encode()
        hdrs["Content-Type"] = "application/json"
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
    request = Request(url, data=data, headers=hdrs, method=method)
    try:
        with urlopen(request, timeout=30) as response:
            payload = response.read()
            ctype = response.headers.get("Content-Type", "")
            if "application/json" in ctype:
                return response.status, json.loads(payload or b"{}")
            return response.status, payload
    except HTTPError as exc:
        payload = exc.read()
        try:
            return exc.code, json.loads(payload or b"{}")
        except json.JSONDecodeError:
            return exc.code, payload


def check(name: str, condition: bool, detail: str = "") -> bool:
    if condition:
        PASSED.append(name)
        print(f"  {GREEN}PASS{RESET}  {name}")
    else:
        FAILED.append((name, detail))
        print(f"  {RED}FAIL{RESET}  {name}  {DIM}{detail}{RESET}")
    return condition


def section(title: str) -> None:
    print(f"\n{BOLD}{title}{RESET}")


def png_bytes(width: int = 8, height: int = 8) -> bytes:
    """Build a genuinely valid PNG (signature + IHDR + IDAT + IEND) via Pillow."""
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (99, 102, 241)).save(buffer, format="PNG")
    return buffer.getvalue()


def multipart(
    field: str, filename: str, content: bytes, mime: str,
    fields: dict[str, str] | None = None, declared_type: str | None = None,
) -> tuple[bytes, str]:
    """Build a complete multipart/form-data body with optional text fields."""
    boundary = "----HobbyLog" + uuid.uuid4().hex[:12]
    parts: list[bytes] = []
    for key, value in (fields or {}).items():
        parts.append(
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
        )
    parts.append(
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'
        f"Content-Type: {declared_type or mime}\r\n\r\n".encode()
    )
    parts.append(content)
    parts.append(f"\r\n--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def main() -> int:
    global BASE
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=BASE)
    args = parser.parse_args()
    BASE = args.base_url.rstrip("/")

    email = f"smoke-{uuid.uuid4().hex[:8]}@test.com"
    password = "SmokeTest123"

    # ------------------------------------------------------------- platform
    section("Platform / health")
    status, health = call("GET", "/api/health")
    check("GET /api/health returns healthy", status == 200 and health.get("status") == "healthy",
          f"status={status}")
    check("health reports a reachable database", health.get("dependencies", {}).get("database", {}).get("healthy") is True)
    check("health reports reachable object storage", health.get("dependencies", {}).get("storage", {}).get("healthy") is True)

    status, arch = call("GET", "/api/meta/architecture")
    check("GET /api/meta/architecture describes 8 layers", status == 200 and len(arch.get("layers", [])) >= 7)

    status, openapi = call("GET", "/openapi.json")
    check("OpenAPI schema is served", status == 200 and "paths" in openapi)

    status, stats = call("GET", "/api/community/stats")
    check("GET /api/community/stats is public", status == 200 and stats.get("users", 0) > 0,
          f"status={status}")

    # ----------------------------------------------------------------- auth
    section("Authentication & authorization")
    status, _ = call("POST", "/api/auth/register", {
        "name": "Smoke Tester", "username": f"smoke{uuid.uuid4().hex[:6]}",
        "email": email, "password": password,
    })
    check("POST /api/auth/register creates an account (201)", status == 201, f"status={status}")

    status, dup = call("POST", "/api/auth/register", {
        "name": "Smoke Tester", "username": "anothername",
        "email": email, "password": password,
    })
    check("duplicate registration is rejected (409)", status == 409, f"status={status}")
    check("duplicate error uses the standard error envelope",
          dup.get("error", {}).get("code") == "email_taken", json.dumps(dup)[:120])

    status, weak = call("POST", "/api/auth/register", {
        "name": "Weak Pass", "username": f"weak{uuid.uuid4().hex[:6]}",
        "email": f"weak-{uuid.uuid4().hex[:6]}@test.com", "password": "12345678",
    })
    check("all-numeric password is rejected (422)", status == 422, f"status={status}")

    status, bad = call("POST", "/api/auth/login", {"email": email, "password": "WrongPass123"})
    check("invalid password is rejected (401)", status == 401, f"status={status}")
    check("invalid login does not reveal whether the user exists",
          bad.get("error", {}).get("code") == "invalid_credentials")

    status, ghost = call("POST", "/api/auth/login",
                         {"email": "nobody@nowhere.com", "password": "Whatever123"})
    check("unknown e-mail returns the identical 401", status == 401
          and ghost.get("error", {}).get("code") == bad.get("error", {}).get("code"))

    status, login = call("POST", "/api/auth/login", {"email": email, "password": password})
    check("valid login returns 200 + tokens", status == 200 and "access_token" in login.get("tokens", {}),
          f"status={status}")
    token = login["tokens"]["access_token"]
    refresh = login["tokens"]["refresh_token"]

    status, _ = call("GET", "/api/profile")
    check("protected route without a token is 401", status == 401, f"status={status}")

    status, _ = call("GET", "/api/profile", token="not-a-real-token")
    check("protected route with a forged token is 401", status == 401, f"status={status}")

    status, refreshed = call("POST", "/api/auth/refresh", {"refresh_token": refresh})
    check("refresh token rotates the access token", status == 200 and "access_token" in refreshed,
          f"status={status}")

    status, _ = call("POST", "/api/auth/refresh", {"refresh_token": token})
    check("an access token cannot be used as a refresh token (401)", status == 401, f"status={status}")

    status, me = call("GET", "/api/auth/me", token=token)
    check("GET /api/auth/me returns the caller", status == 200 and me.get("user", {}).get("email") == email)

    # --------------------------------------------------------------- skills
    section("Skills CRUD")
    status, skill = call("POST", "/api/skills", {
        "title": "Smoke Photography", "category": "photography",
        "description": "Created by the smoke test.", "goal_per_week": 120,
        "minutes_per_session": 30, "accent": "violet", "icon": "📷",
    }, token=token)
    check("POST /api/skills creates a skill (201)", status == 201, f"status={status} {json.dumps(skill)[:150]}")
    skill_id = skill.get("id", "")

    status, dup = call("POST", "/api/skills", {"title": "Smoke Photography", "category": "art"}, token=token)
    check("duplicate skill title is 409", status == 409, f"status={status}")

    status, listed = call("GET", "/api/skills", token=token)
    check("GET /api/skills lists the caller's skills", status == 200 and listed.get("total", 0) >= 1)

    status, updated = call("PUT", f"/api/skills/{skill_id}",
                           {"title": "Smoke Photography v2", "goal_per_week": 180}, token=token)
    check("PUT /api/skills/{id} updates it", status == 200
          and updated.get("title") == "Smoke Photography v2", f"status={status}")

    status, bad = call("POST", "/api/skills", {"title": "x", "category": "art"}, token=token)
    check("skill title under 2 chars is 422", status == 422, f"status={status}")

    status, unknown = call("POST", "/api/skills", {"title": "Orphan", "skill_id": "does-not-exist"}, token=token)
    check("unknown field is rejected (strict schema)", status == 422, f"status={status}")

    # ---------------------------------------------------------------- goals
    section("Goals & milestones")
    status, goal = call("POST", "/api/goals", {
        "title": "Reach 20 practice hours", "skill_id": skill_id,
        "target_value": 20, "unit": "hours", "deadline": "2027-01-31",
    }, token=token)
    check("POST /api/goals creates a goal (201)", status == 201, f"status={status}")
    check("auto-generated 4 milestones (25/50/75/100%)",
          len(goal.get("milestones", [])) == 4, f"got {len(goal.get('milestones', []))}")
    goal_id = goal.get("id", "")

    # ------------------------------------------------------------- practice
    section("Practice sessions, streaks & badges")
    status, log = call("POST", "/api/practice", {
        "skill_id": skill_id, "duration_minutes": 60,
        "activity": "Smoke test session", "notes": "Automated verification.",
    }, token=token)
    check("POST /api/practice logs a session (201)", status == 201, f"status={status} {json.dumps(log)[:200]}")
    check("streak becomes 1 after the first session",
          log.get("stats", {}).get("current_streak") == 1, json.dumps(log.get("stats", {}))[:200])
    check("total minutes accumulates", log.get("stats", {}).get("total_minutes") == 60)
    check("the 'first_log' badge is awarded",
          any(b["code"] == "first_log" for b in log.get("new_badges", [])),
          json.dumps(log.get("new_badges", []))[:200])
    check("goal progress advanced (60 min = 1h of a 20h goal)",
          any(abs(u["progress_percent"] - 5.0) < 0.6 for u in log.get("progress_updates", [])),
          json.dumps(log.get("progress_updates", []))[:250])

    status, second = call("POST", "/api/practice", {
        "skill_id": skill_id, "duration_minutes": 30, "activity": "Second session",
    }, token=token)
    check("a second session on the same day does NOT double the streak",
          second.get("stats", {}).get("current_streak") == 1,
          f"got {second.get('stats', {}).get('current_streak')}")
    check("total minutes accumulate to 90", second.get("stats", {}).get("total_minutes") == 90)

    status, streak = call("GET", "/api/practice/streak", token=token)
    check("GET /api/practice/streak reports practiced_today", status == 200
          and streak.get("practiced_today") is True)

    status, _ = call("POST", "/api/practice", {
        "skill_id": skill_id, "duration_minutes": 0,
    }, token=token)
    check("zero-minute session is rejected (422)", status == 422, f"status={status}")

    status, _ = call("POST", "/api/practice", {
        "skill_id": "no-such-skill", "duration_minutes": 30,
    }, token=token)
    check("logging against a foreign skill id is 404", status == 404, f"status={status}")

    status, history = call("GET", f"/api/practice?skill_id={skill_id}", token=token)
    check("GET /api/practice filters by skill", status == 200 and history.get("total") == 2,
          f"total={history.get('total')}")

    # ------------------------------------------------------------ analytics
    section("Analytics")
    status, dash = call("GET", "/api/analytics/dashboard", token=token)
    check("GET /api/analytics/dashboard returns a full payload", status == 200
          and "charts" in dash and "headline" in dash, f"status={status}")
    charts = dash.get("charts", {})
    for key in ("by_skill", "weekly_trend", "daily_30", "heatmap", "distribution",
                "goal_progress", "activity_by_hour"):
        check(f"chart '{key}' is populated", bool(charts.get(key)))
    check("headline total_hours is 1.5", dash.get("headline", {}).get("total_hours") == 1.5,
          f"got {dash.get('headline', {}).get('total_hours')}")
    check("goal progress reflects 90 logged minutes of a 20h goal (7.5%)",
          any(abs(g["progress_percent"] - 7.5) < 0.6 for g in charts.get("goal_progress", [])),
          json.dumps([{ "p": g["progress_percent"], "c": g["current_value"]}
                       for g in charts.get("goal_progress", [])])[:200])

    status, badges = call("GET", "/api/analytics/badges", token=token)
    check("GET /api/analytics/badges returns the catalogue", status == 200
          and len(badges.get("items", [])) == 10)

    status, export = call("GET", "/api/analytics/export", token=token)
    check("data export never leaks the password hash",
          status == 200 and "password" not in json.dumps(export).lower())

    # ------------------------------------------------------------- storage
    section("Cloud object storage")
    body, ctype = multipart("file", "proof.png", png_bytes(), "image/png",
                            fields={"scope": "proof", "visibility": "public"})
    status, upload = call("POST", "/api/files/upload", raw=body, content_type=ctype, token=token)
    check("POST /api/files/upload stores an image (201)", status == 201,
          f"status={status} {json.dumps(upload)[:200]}")
    if status == 201:
        check("upload records a SHA-256 checksum", len(upload.get("checksum", "")) == 64)
        check("object key follows users/<uid>/<scope>/ layout",
              upload.get("storage_path", "").startswith("users/"), upload.get("storage_path", ""))

    body, ctype = multipart("file", "payload.exe", b"MZ\x90\x00\x03", "image/png")
    status, _ = call("POST", "/api/files/upload", raw=body, content_type=ctype, token=token)
    check("a .exe renamed to .png is rejected (415)", status == 415, f"status={status}")

    body, ctype = multipart("file", "broken.png", b"\x89PNG\r\nnot-a-real-png\x00\x00", "image/png")
    status, _ = call("POST", "/api/files/upload", raw=body, content_type=ctype, token=token)
    check("a PNG header with garbage body is rejected (415)", status == 415, f"status={status}")

    body, ctype = multipart("file", "xss.png", b"<script>alert(1)</script>", "text/html")
    status, _ = call("POST", "/api/files/upload", raw=body, content_type=ctype, token=token)
    check("a non-allow-listed content type is rejected (415)", status == 415, f"status={status}")

    body, ctype = multipart("file", "sneaky.exe", b"MZ\x90\x00\x03", "application/octet-stream")
    status, _ = call("POST", "/api/files/upload", raw=body, content_type=ctype, token=token)
    check("a content type outside the allow-list is rejected (415)", status == 415, f"status={status}")

    if upload and status == 201:
        status, payload = call("GET", upload["url"])
        check("the public object URL serves the bytes", status == 200 and isinstance(payload, bytes)
              and len(payload) > 0)

    status, bucket = call("GET", "/api/files/bucket", token=token)
    check("GET /api/files/bucket lists stored objects", status == 200
          and bucket.get("object_count", 0) >= 1, f"objects={bucket.get('object_count')}")

    # private upload -> expiring signed URL
    body, ctype = multipart("file", "secret.png", png_bytes(4, 4), "image/png",
                            fields={"scope": "proof", "visibility": "private"})
    status, private = call("POST", "/api/files/upload", raw=body, content_type=ctype, token=token)
    if check("a private upload returns a signed URL (201)", status == 201, f"status={status}"):
        signed = private.get("url", "")
        status, _ = call("GET", signed)
        check("the signed URL resolves without a bearer token", status == 200, f"status={status}")
        head, expiry, signature = signed.rsplit("/", 1)[-1].split(".")
        status, _ = call("GET", f"/api/files/signed/{head}.0000000000.{signature}")
        check("a signed URL with a rewritten expiry is rejected (403)", status == 403, f"status={status}")
        status, _ = call("GET", f"/api/files/signed/{head}.{expiry}.{'0' * 40}")
        check("a signed URL with a forged signature is rejected (403)", status == 403, f"status={status}")

    # ------------------------------------------------------------- community
    section("Community sharing")
    status, post = call("POST", "/api/posts", {
        "content": "Smoke test: logged my first verified session 🎉",
        "skill_id": skill_id,
    }, token=token)
    check("POST /api/posts creates a post (201)", status == 201, f"status={status}")
    post_id = post.get("id", "")

    status, feed = call("GET", "/api/feed", token=token)
    check("GET /api/feed returns the post", status == 200
          and any(p["id"] == post_id for p in feed.get("items", [])))
    check("feed returns pagination metadata",
          "has_next" in feed and "total" in feed)

    status, empty = call("GET", "/api/feed?search=zzz-no-such-text-zzz")
    check("feed search filters correctly", status == 200 and empty.get("total") == 0)

    # second user
    other_email = f"smoke2-{uuid.uuid4().hex[:8]}@test.com"
    status, other = call("POST", "/api/auth/register", {
        "name": "Second User", "username": f"other{uuid.uuid4().hex[:6]}",
        "email": other_email, "password": password,
    })
    check("second account registers", status == 201, f"status={status}")
    status, other_login = call("POST", "/api/auth/login", {"email": other_email, "password": password})
    other_token = other_login["tokens"]["access_token"]

    status, liked = call("POST", f"/api/posts/{post_id}/like", token=other_token)
    check("user B likes user A's post (201)", status == 201 and liked.get("likes_count") == 1,
          f"status={status} {json.dumps(liked)[:150]}")

    status, dup_like = call("POST", f"/api/posts/{post_id}/like", token=other_token)
    check("duplicate like is rejected (409)", status == 409, f"status={status}")

    status, comment = call("POST", f"/api/posts/{post_id}/comments",
                           {"content": "Great work, this is the consistency I need."}, token=other_token)
    check("POST comment succeeds (201)", status == 201, f"status={status}")
    comment_id = comment.get("id", "")

    status, comments = call("GET", f"/api/posts/{post_id}/comments", token=token)
    check("GET comments returns the comment", status == 200 and comments.get("total") == 1)

    # ---------------------------------------------- authorization / isolation
    section("Authorization & data isolation")
    status, _ = call("DELETE", f"/api/posts/{post_id}", token=other_token)
    check("user B cannot delete user A's post (422)", status == 422, f"status={status}")

    status, _ = call("PUT", f"/api/skills/{skill_id}", {"title": "Hijacked"}, token=other_token)
    check("user B cannot edit user A's skill (403)", status == 403, f"status={status}")

    status, _ = call("DELETE", f"/api/skills/{skill_id}", token=other_token)
    check("user B cannot delete user A's skill (403)", status == 403, f"status={status}")

    status, _ = call("DELETE", f"/api/comments/{comment_id}", token=token)
    check("the post owner can delete a comment on their post", status == 200, f"status={status}")

    status, other_skills = call("GET", "/api/skills", token=other_token)
    check("user B's skill list does not contain user A's skill",
          all(s["id"] != skill_id for s in other_skills.get("items", [])))

    status, public_view = call("GET", f"/api/users/{login['user']['username']}")
    check("the public profile never exposes the e-mail", status == 200
          and "email" not in json.dumps(public_view).lower(),
          json.dumps(public_view)[:200])

    status, _ = call("DELETE", f"/api/posts/{post_id}", token=token)
    check("the owner can delete their own post", status == 200, f"status={status}")

    status, _ = call("GET", f"/api/posts/{post_id}")
    check("a deleted post is really gone (404)", status == 404, f"status={status}")

    # ------------------------------------------------------------- follow
    section("Follow graph")
    status, follow = call("POST", f"/api/users/{other_login['user']['username']}/follow", token=token)
    check("follow a user (200)", status == 200, f"status={status}")
    status, _ = call("POST", f"/api/users/{other_login['user']['username']}/follow", token=token)
    check("duplicate follow is 409", status == 409, f"status={status}")
    status, _ = call("POST", f"/api/users/{login['user']['username']}/follow", token=token)
    check("self-follow is rejected (422)", status == 422, f"status={status}")
    status, following_feed = call("GET", "/api/feed?scope=following", token=token)
    check("the following feed is scoped", status == 200 and "items" in following_feed)

    # -------------------------------------------------------------- cleanup
    section("Account deletion (right to be forgotten)")
    status, _ = call("DELETE", "/api/users/me", token=other_token)
    check("account self-deletion succeeds", status == 200, f"status={status}")
    status, _ = call("GET", "/api/profile", token=other_token)
    check("the deleted account's token is now rejected (401)", status == 401, f"status={status}")

    # --------------------------------------------------------------- report
    print(f"\n{BOLD}{'=' * 62}{RESET}")
    print(f"{BOLD}Total:{RESET} {len(PASSED) + len(FAILED)}   "
          f"{GREEN}passed: {len(PASSED)}{RESET}   "
          f"{RED if FAILED else GREEN}failed: {len(FAILED)}{RESET}")
    if FAILED:
        print(f"\n{RED}{BOLD}Failures:{RESET}")
        for name, detail in FAILED:
            print(f"  - {name}  {DIM}{detail}{RESET}")
    print(f"{BOLD}{'=' * 62}{RESET}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    started = time.time()
    code = main()
    print(f"Completed in {time.time() - started:.1f}s")
    sys.exit(code)
