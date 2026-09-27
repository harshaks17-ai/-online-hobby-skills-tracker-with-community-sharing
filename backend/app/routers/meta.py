"""Operational endpoints: health, architecture, service descriptions."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from app.config import settings
from app.database import database_health
from app.middleware.auth import DbSession
from app.services import post_service
from cloud import auth_service, database_service, storage_service

router = APIRouter(tags=["Platform"])


@router.get("/health", summary="Liveness + dependency health")
def health() -> dict:
    """
    The single endpoint a cloud load balancer / uptime monitor polls. It reports
    the state of every dependency so a 503 tells you *which* service broke.
    """
    database = database_service.check_database()
    storage = storage_service.storage_health()
    healthy = bool(database.get("healthy") and storage.get("healthy"))
    return {
        "status": "healthy" if healthy else "degraded",
        "service": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "dependencies": {"database": database, "storage": storage},
    }


@router.get("/meta/config", summary="Non-secret runtime configuration")
def meta_config() -> dict:
    """Safe to expose: contains no keys, only the *names* of the providers."""
    return {
        "app_name": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "api_prefix": settings.api_prefix,
        "providers": {
            "database": settings.database_provider,
            "storage": settings.storage_provider,
            "identity": settings.identity_provider,
        },
        "limits": {
            "max_upload_bytes": settings.max_upload_bytes,
            "rate_limit_requests": settings.rate_limit_requests,
            "rate_limit_window_seconds": settings.rate_limit_window_seconds,
        },
        "features": {
            "object_storage": True,
            "signed_urls": True,
            "community_feed": True,
            "analytics": True,
            "moderation": True,
            "data_export": True,
        },
    }


@router.get("/meta/architecture", summary="The architecture this deployment implements")
def architecture() -> dict:
    """
    Machine-readable architecture description. The project report and the
    frontend "Cloud architecture" panel both render from this, so the
    documentation can never drift from the running system.
    """
    return {
        "layers": [
            {
                "name": "Presentation",
                "technology": "React 19 + Vite + Tailwind CSS",
                "responsibility": "SPA, routing, optimistic UI, chart rendering",
            },
            {
                "name": "Edge",
                "technology": "CDN / API Gateway",
                "responsibility": "TLS termination, static asset caching, rate limiting, WAF",
            },
            {
                "name": "Application",
                "technology": "FastAPI (Python) REST API",
                "responsibility": "Business rules, authorization, aggregation",
                "scaling": "Stateless -> horizontal replicas behind a load balancer",
            },
            {
                "name": "Identity",
                "technology": "JWT (HS256) / Firebase Auth in production",
                "responsibility": "Authentication, token issuance, role claims",
            },
            {
                "name": "Data",
                "technology": "Cloud SQL (PostgreSQL) / Firestore",
                "responsibility": "Users, skills, sessions, goals, posts, social graph",
            },
            {
                "name": "Object storage",
                "technology": "Cloud Storage / S3 + CDN",
                "responsibility": "Avatars, achievement images, post media, signed URLs",
            },
            {
                "name": "Compute",
                "technology": "Cloud Functions / scheduled jobs",
                "responsibility": "onPracticeCreate -> stats roll-up, badge awards, nightly recompute",
            },
            {
                "name": "Observability",
                "technology": "Cloud Logging / CloudWatch",
                "responsibility": "Structured request logs, latency, error rate alerts",
            },
        ],
        "data_flow": [
            "Browser -> CDN (static assets)",
            "Browser -> API Gateway -> FastAPI replica",
            "FastAPI -> Identity service (verify JWT)",
            "FastAPI -> Cloud DB (read/write rows)",
            "Browser -> signed URL -> Object Storage (bytes)",
            "FastAPI -> Event -> Cloud Function -> Cloud DB (stats roll-up)",
        ],
        "current_providers": {
            "identity": auth_service.describe_identity_provider(),
            "database": database_service.describe_database(),
            "storage": storage_service.describe_storage(),
        },
    }


@router.get("/community/overview", summary="Community dashboard payload")
def community_overview(db: DbSession) -> dict:
    """Aggregates everything the Community page needs into one call."""
    from app.services import analytics_service

    return {
        "stats": analytics_service.platform_health(db),
        "categories": analytics_service.category_breakdown(db),
        "trending_skills": post_service.trending_skills(db, limit=10),
        "activity": analytics_service.platform_daily_activity(db, days=21),
        "leaderboard": analytics_service.leaderboard(db, limit=10),
    }
