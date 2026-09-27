# HobbyLog Cloud — Online Hobby & Skills Tracker with Community Sharing

**Author:** Harsha K S

A full-stack, cloud-ready tracker for hobbies and skills: log practice, watch
streaks and progress charts grow, set goals, and share updates with a community
feed. The same codebase runs entirely locally (bundled emulators, zero external
accounts) or against real managed cloud services by flipping environment
variables.

- **Backend** — FastAPI · SQLAlchemy 2 · SQLite/PostgreSQL · hand-rolled HS256 JWT ·
  stdlib PBKDF2 password hashing · multipart upload with magic-byte validation ·
  expiring signed URLs
- **Frontend** — React 19 · Vite · Tailwind CSS · framer-motion · custom SVG charts
  (no chart library)
- **Cloud abstraction** — a `backend/cloud/` layer that swaps local emulators for
  Cloud SQL/Firestore, Cloud Storage/S3 and Firebase Auth/Cognito

---

## Quick start

Two terminals are all you need. No external accounts, databases or buckets.

### 1. Backend — http://127.0.0.1:8000

```powershell
cd backend
py -3 -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python run.py
```

On first boot the database is created and seeded with the demo dataset
(8 people, 16 skills, ~1k sessions, 17 goals, 21 posts).

### 2. Frontend — http://localhost:5173

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies `/api` and `/media`
to the backend, so there is one origin and no CORS setup in development.

> `dev-server.ps1` in the repository root starts both processes for you.

---

## Test credentials

Every demo account uses the same password: **`pass1234`**

| Email                 | Username     | Role      | Focus                       |
| --------------------- | ------------ | --------- | --------------------------- |
| `user@test.com`       | `demo`       | Member    | Primary walkthrough account |
| `aisha@test.com`      | `aisha`      | Member    | Photography + film          |
| `dev@test.com`        | `devansh`    | Member    | Coding + side projects      |
| `marco@test.com`      | `marco`      | Member    | Guitar + music production   |
| `yuki@test.com`       | `yuki`       | Member    | Language learning           |
| `leo@test.com`        | `leo`        | Member    | Fitness + running           |
| `sam@test.com`        | `sam`        | Member    | Cooking                     |
| `moderator@test.com`  | `mod_nadia`  | Moderator | Moderation queue demo       |

The login form is pre-filled with `user@test.com` / `pass1234`. You can also
register a brand-new account from the **Join** page.

> These are throwaway demo credentials for a seeded local dataset. No real
> identities are used anywhere in this project.

---

## Tests

| Suite                  | Command                                          | Needs |
| ---------------------- | ------------------------------------------------ | ----- |
| Backend unit + API     | `cd backend; .venv\Scripts\python -m pytest`      | nothing (mounts the app in-process on a throw-away database) |
| Live HTTP smoke test   | `cd backend; .venv\Scripts\python scripts\smoke_test.py` | server on `:8000` |
| Frontend lint          | `cd frontend; npm run lint`                       | nothing |
| Production build       | `cd frontend; npm run build`                      | nothing |
| Browser end-to-end     | `cd frontend; node e2e/browser.test.mjs`          | dev server on `:5173` (and `:8000`), Playwright Chromium |

The pytest suite never touches your running database: it points `SQLITE_PATH`
and `STORAGE_ROOT` at a temporary directory before the app is imported, so it is
safe to run at the same time as `run.py`.

---

## Project structure

```
project_2/
├── backend/
│   ├── app/
│   │   ├── config.py            # settings + blank-value sanitising
│   │   ├── database.py          # engine, session, WAL pragmas
│   │   ├── models.py            # SQLAlchemy ORM models
│   │   ├── schemas/             # strict Pydantic request/response models
│   │   ├── middleware/          # auth, rate limiting, request IDs, security headers
│   │   ├── routers/             # auth, skills, practice, goals, posts, social,
│   │   │                        # analytics, community, files, users, profile, meta
│   │   ├── services/            # business logic (goal back-fill, streaks, badges…)
│   │   ├── utils/               # password hashing, JWT, errors, helpers
│   │   └── seed.py              # deterministic demo dataset
│   ├── cloud/                   # provider abstraction: storage, auth, database
│   ├── scripts/smoke_test.py    # 85-check live HTTP suite
│   ├── tests/                   # 130 pytest tests
│   ├── requirements.txt
│   └── run.py
├── frontend/
│   ├── src/
│   │   ├── pages/               # Landing, Dashboard, Skills, Practice, Goals,
│   │   │                        # Feed, Analytics, CloudConsole, Settings, …
│   │   ├── components/ui/       # design system (Card, Button, Tooltip, Progress…)
│   │   ├── components/charts/   # hand-written SVG charts
│   │   ├── contexts/            # auth, theme, toast
│   │   └── lib/                 # api client, formatters, hooks
│   ├── e2e/browser.test.mjs     # 45-check Chromium suite
│   └── screenshots/             # captured by the E2E run
├── docs/                        # architecture + testing notes
└── .gitignore
```

---

## How it maps to the cloud

The app is written against interfaces, not vendors. Set these in `backend/.env`
to move between the bundled emulator and a managed service:

| Concern        | Local (default)               | Google Cloud                    | AWS                |
| -------------- | ----------------------------- | ------------------------------- | ------------------ |
| Database       | `DATABASE_PROVIDER=local` → SQLite (WAL) | `gcp` → Cloud SQL (PostgreSQL) | `aws` → RDS        |
| Object storage | `STORAGE_PROVIDER=local` → filesystem bucket | `gcp` → Cloud Storage    | `aws` → S3         |
| Identity       | `IDENTITY_PROVIDER=local` → app-managed JWT | `gcp` → Firebase Auth    | `aws` → Cognito    |

Object keys always follow `users/<user_id>/<scope>/<object>`, private objects
are served through HMAC-signed URLs that expire (`SIGNED_URL_TTL_SECONDS`,
default 1 hour), and the `/api/files/bucket` endpoint reports the active
provider so the Cloud Console page in the UI can display it.

**Security defaults:** secrets live only in `backend/.env` (never committed),
passwords are stored as PBKDF2-HMAC-SHA256 with 210k iterations and a fresh
salt, JWTs pin the `alg` header, upload validation runs size → declared type →
extension → magic bytes → full image decode, responses carry
`X-Content-Type-Options` / `X-Frame-Options` / `Referrer-Policy` /
`Content-Security-Policy`, and `/api/auth/*` is rate-limited separately from the
rest of the API.

---

## Resetting the demo data

```powershell
cd backend
.venv\Scripts\python run.py --reset
```
