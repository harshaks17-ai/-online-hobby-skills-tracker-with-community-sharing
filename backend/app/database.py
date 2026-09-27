"""
Database engine / session wiring.

This module is the *only* place that knows how to reach storage. Every feature
module talks to SQLAlchemy sessions, which means swapping SQLite for Cloud SQL
(PostgreSQL) or Firestore is a provider change, not a rewrite.
"""

from __future__ import annotations

from collections.abc import Generator, Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# A value containing "://" is a real SQLAlchemy URL (managed DB); anything else
# is treated as a SQLite file path. This keeps Windows paths such as
# "C:\...\hobbylog.db" from being mis-parsed as a URL.
_raw_target = settings.resolved_sqlite_path
_is_url = "://" in _raw_target

if _is_url:  # pragma: no cover - only used with a managed instance configured
    engine: Engine = create_engine(
        _raw_target,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        future=True,
        echo=False,
    )
else:
    Path(_raw_target).parent.mkdir(parents=True, exist_ok=True)
    engine: Engine = create_engine(
        f"sqlite:///{_raw_target}",
        connect_args={"check_same_thread": False, "timeout": 30},
        future=True,
        echo=False,
    )

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _connection_record) -> None:
        """Durability + concurrency pragmas (WAL is the production-recommended mode)."""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=8000")
        cursor.close()

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)


class Base(DeclarativeBase):
    """Declarative base for every ORM model."""


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Context manager for background jobs / scripts / seeding."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db() -> None:
    """Create tables if they do not exist (idempotent bootstrap)."""
    from app import models  # noqa: F401  (ensures models are registered)

    Base.metadata.create_all(bind=engine)


def database_health() -> dict:
    """Health probe used by the /api/health endpoint and monitoring demos."""
    from sqlalchemy import text

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "up", "provider": settings.database_provider}
    except Exception as exc:  # pragma: no cover - failure path
        return {"status": "down", "provider": settings.database_provider, "error": str(exc)}
