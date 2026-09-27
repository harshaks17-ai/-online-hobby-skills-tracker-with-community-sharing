# Architecture

HobbyLog Cloud is a three-tier application with an explicit cloud abstraction
layer. The default configuration runs entirely on a developer machine with no
external accounts; every vendor touchpoint sits behind an interface so the same
binary can be pointed at managed services.

## Layers

| Layer          | Technology                          | Responsibility |
| -------------- | ----------------------------------- | -------------- |
| Presentation   | React 19, Vite, Tailwind, framer-motion | SPA, routing, optimistic UI, hand-written SVG charts |
| Edge           | Vite dev proxy / reverse proxy      | Single origin in development, TLS + static hosting in production |
| Application    | FastAPI, Pydantic (strict schemas), routers + services | HTTP contract, validation, business rules |
| Identity       | HS256 JWT access/refresh tokens     | Registration, sign-in, rotation, moderation role |
| Data           | SQLAlchemy 2 ORM over SQLite/PostgreSQL | Skills, sessions, goals, posts, follows, badges |
| Object Storage | Local filesystem emulator / Cloud Storage / S3 | Profile art, skill images, proofs |
| Compute        | Uvicorn workers                     | Request handling, scheduled re-derivation of progress |
| Observability  | Structured access log + request IDs | Per-request id, status, latency, error envelope |

## Request path

```
Browser ──► Vite proxy (/api, /media) ──► FastAPI
                                            │  RequestContextMiddleware  (X-Request-Id, security headers)
                                            │  RateLimitMiddleware       (per-client budgets; auth paths bucketed separately)
                                            │  auth dependency           (Bearer JWT → current user)
                                            ▼
                                          router ──► service ──► SQLAlchemy session ──► SQLite (WAL)
                                                                     │
                                                                     └──► cloud/storage_service (local bucket or presigned S3/GCS)
```

Every failure leaves through one handler and one envelope:

```json
{ "error": { "code": "not_skill_owner", "message": "…", "details": {} } }
```

Pydantic request-body problems keep FastAPI's native `{"detail": [...]}` shape,
which is what the smoke suite and the UI both expect.

## Provider abstraction

`backend/cloud/` owns every vendor decision:

- **storage_service** — `put_bytes`, `delete`, `sign_url`, `verify_signed_url`,
  `list_prefix`, `describe_storage`. The local implementation is a filesystem
  bucket under `STORAGE_ROOT`; the cloud implementation issues a real presigned
  GET with the same token format, so the URL contract never changes.
- **database** — chosen through `DATABASE_PROVIDER`. `local` is SQLite with WAL
  pragmas; `gcp`/`aws` are the same SQLAlchemy URL pointed at Cloud SQL/RDS.
- **identity** — `IDENTITY_PROVIDER=local` means the app mints and verifies its
  own JWTs. Swapping in Firebase Auth or Cognito only changes where tokens are
  minted, not how routes read them.

Config is resolved once at import time. Blank values in `.env` are normalised
back to the local defaults by a Pydantic validator, and `resolved_storage_root`
/ `resolved_sqlite_path` are the only accessors used anywhere — this is what
keeps `/media` from accidentally mounting the repository tree.

## Progress derivation

Sessions are the source of truth. Totals, streaks, badge eligibility and goal
progress are all *derived*:

- `POST /api/practice` appends a session, then re-derives stats, badges and goal
  progress in the same transaction.
- `create_goal` back-fills progress from sessions that already exist, so a goal
  created after a month of practice starts at the right percentage.
- `POST /api/goals/{id}/rebuild` re-derives everything from history — the repair
  path if state is ever in doubt.

## Local simulation vs. deployment

| Concern        | Local                              | Cloud                                    |
| -------------- | ---------------------------------- | ---------------------------------------- |
| Database       | `backend/data/hobbylog.db` (WAL)   | Cloud SQL / RDS, same SQLAlchemy URL     |
| Objects        | `backend/storage/` filesystem      | Cloud Storage / S3, presigned GET        |
| Tokens         | App-minted HS256 JWT               | Firebase Auth / Cognito                  |
| Secrets        | `backend/.env` (git-ignored)       | Secret Manager / IAM roles               |
| Static assets  | Vite dev server                    | CDN-hosted `frontend/dist`               |

Nothing in the code path reads a live credential: `.env.example` ships dummy
values, and the only real `SECRET_KEY` lives in the git-ignored `.env`.
