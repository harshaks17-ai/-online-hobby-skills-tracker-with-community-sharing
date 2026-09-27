# Testing

Four suites cover the stack from pure functions up to a real browser.

## 1. Backend unit + API tests — 130 tests

```powershell
cd backend
.venv\Scripts\python -m pytest
```

| File                    | Covers |
| ----------------------- | ------ |
| `test_units.py`         | streak math, progress rounding, unit conversion, milestone generation, PBKDF2 round-trip, JWT typing, signed-URL signing/verification |
| `test_auth.py`          | register/login/refresh/logout, duplicate e-mail & username, weak passwords, forged tokens, password change |
| `test_skills.py`        | CRUD, strict schemas, 409 on duplicates, ownership boundaries |
| `test_practice.py`      | logging, streak + badge responses, filters, edit/delete, cross-user isolation |
| `test_goals.py`         | auto-milestones, **back-fill of pre-existing sessions**, rebuild, weekly goals, `not_goal_owner` |
| `test_analytics.py`     | dashboard payload, chart population, 10-badge catalogue, portable export |
| `test_storage.py`       | magic-byte rejection, public URLs, signed URLs, tamper/expiry/cross-object rejection, bucket inventory |
| `test_community.py`     | posts, feed search, likes, comments, follow/unfollow, self-follow, account deletion |
| `test_security.py`      | rate-limiter behaviour (429 + `Retry-After`), security headers, error envelope, e-mail/hash leakage |
| `test_demo_data.py`     | the eight documented demo accounts sign in, seeding is idempotent |
| `test_platform.py`      | health, architecture, public config, `/media` cannot reach the repo tree |

`tests/conftest.py` sets `SQLITE_PATH` and `STORAGE_ROOT` to a temp directory
**before** importing the app, so the suite runs against a throw-away database
and can run alongside a live `run.py`.

## 2. Live HTTP smoke test — 85 checks

```powershell
# terminal 1
cd backend; .venv\Scripts\python run.py
# terminal 2
cd backend; .venv\Scripts\python scripts\smoke_test.py
```

Talks real HTTP to `127.0.0.1:8000` — the same path the browser uses — through
auth → skills → goals → practice → analytics → storage → community →
authorization. This is the fastest proof that the whole stack is wired up.

## 3. Frontend lint + build

```powershell
cd frontend
npm run lint     # oxlint, 0 warnings / 0 errors
npm run build    # production bundle
```

## 4. Browser end-to-end — 45 checks

```powershell
# terminal 1  backend  :8000
# terminal 2  frontend :5173
cd frontend
node e2e/browser.test.mjs [--headed] [--base-url http://localhost:5173]
```

Drives a real Chromium through registration, sign-in, onboarding, creating a
skill and goal, logging practice, sharing a post, analytics, settings and the
Cloud Console. It fails on **any** console error, page error or failed request,
and asserts the production build's responsive layout at a 390 px viewport.
Screenshots land in `frontend/screenshots/`.

## Regression that motivated a test

A blank `STORAGE_ROOT=` in `.env` used to resolve to `Path('')`, i.e. the
backend directory, which mounted the whole source tree under `/media`
(`/media/.env` would have exposed `SECRET_KEY`) and made `/api/files/bucket`
walk `.venv`. `test_platform.py::test_backend_does_not_serve_its_own_dotenv`
now pins that down.
