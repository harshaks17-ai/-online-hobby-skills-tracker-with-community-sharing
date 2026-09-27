"""
FastAPI application factory.

Start with:   python -m uvicorn app.main:app --reload --port 8000
or simply:    python run.py
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.config import settings
from app.database import Base, engine
from app.middleware.request_context import RateLimitMiddleware, RequestContextMiddleware
from app.routers import (
    analytics,
    auth,
    community,
    files,
    goals,
    meta,
    posts,
    practice,
    profile,
    skills,
    social,
    users,
)
from app.utils.errors import register_exception_handlers

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)-18s | %(message)s",
)
logger = logging.getLogger("hobbylog")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create schema, seed demo data, warm caches. Shutdown: dispose pool."""
    logger.info("Starting %s v%s (%s)", settings.app_name, settings.app_version, settings.environment)
    Base.metadata.create_all(bind=engine)

    if settings.seed_on_startup:
        from app.seed import seed_if_empty

        seed_if_empty()

    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    logger.info("Database reachable. Object storage root: %s", settings.resolved_storage_root)
    logger.info("API docs available at /docs")
    yield
    engine.dispose()
    logger.info("Shutdown complete.")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "REST API for the **Online Hobby & Skills Tracker with Community "
            "Sharing on Cloud**.\n\n"
            "Demonstrates cloud identity (JWT), a managed relational database, "
            "object storage with signed URLs, event-driven stats roll-ups, "
            "community features and analytics."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
        contact={"name": "HobbyLog Cloud", "url": "https://github.com/"},
        license_info={"name": "MIT"},
    )

    # CORS: the Vite dev server is a different origin from the API.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-Id", "X-Response-Time-ms", "Retry-After"],
    )
    app.add_middleware(RateLimitMiddleware)
    app.add_middleware(RequestContextMiddleware)

    register_exception_handlers(app)

    # Public object-storage prefix (the "CDN" in the architecture diagram).
    # Always the resolved bucket directory - a blank STORAGE_ROOT would otherwise
    # mount the whole backend tree and expose `.env`.
    storage_root = Path(settings.resolved_storage_root)
    storage_root.mkdir(parents=True, exist_ok=True)
    app.mount("/media", StaticFiles(directory=str(storage_root)), name="media")

    app.include_router(meta.router, prefix=settings.api_prefix)
    app.include_router(auth.router, prefix=settings.api_prefix)
    app.include_router(profile.router, prefix=settings.api_prefix)
    app.include_router(users.router, prefix=settings.api_prefix)
    app.include_router(skills.router, prefix=settings.api_prefix)
    app.include_router(practice.router, prefix=settings.api_prefix)
    app.include_router(goals.router, prefix=settings.api_prefix)
    app.include_router(posts.router)
    app.include_router(social.router)
    app.include_router(files.router, prefix=settings.api_prefix)
    app.include_router(analytics.router, prefix=settings.api_prefix)
    app.include_router(community.router, prefix=settings.api_prefix)

    @app.get("/", include_in_schema=False)
    def root() -> dict:
        return {
            "service": settings.app_name,
            "version": settings.app_version,
            "docs": "/docs",
            "health": f"{settings.api_prefix}/health",
            "frontend": "http://localhost:5173",
        }

    return app


app = create_app()
