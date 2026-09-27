"""
Cloud database service (the "managed relational database" seam).

Local provider
--------------
SQLite in WAL mode through SQLAlchemy. It behaves like a small cloud instance:
ACID transactions, foreign keys, composite indexes, connection pooling.

Managed equivalents
-------------------
* GCP  -> Cloud SQL for PostgreSQL          (set DATABASE_URL / sqlite_path)
* AWS  -> RDS / Aurora PostgreSQL
* Azure-> Azure Database for PostgreSQL
* Document variant (if you prefer NoSQL) -> Firestore / DynamoDB, where each
  model above maps to a collection and each relationship to a subcollection.

What matters for this project is that the *interface* is identical, so the
"scalability" story is a configuration change rather than a rewrite.
"""

from __future__ import annotations

from typing import Any, Sequence

from sqlalchemy import text

from app.config import settings
from app.database import SessionLocal, engine


def query(statement: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Run a read query and return plain dicts (driver-agnostic)."""
    with engine.connect() as conn:
        rows = conn.execute(text(statement), params or {})
        return [dict(row._mapping) for row in rows]


def query_one(statement: str, params: dict[str, Any] | None = None) -> dict[str, Any] | None:
    rows = query(statement, params)
    return rows[0] if rows else None


def execute(statement: str, params: dict[str, Any] | None = None) -> int:
    """Run a write statement in its own transaction. Returns affected row count."""
    with engine.begin() as conn:
        result = conn.execute(text(statement), params or {})
        return result.rowcount


def check_database() -> dict[str, Any]:
    """Latency probe used by the health endpoint and the monitoring demo."""
    import time

    started = time.perf_counter()
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {
            "healthy": True,
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            "provider": settings.database_provider,
        }
    except Exception as exc:  # pragma: no cover - failure path
        return {"healthy": False, "error": str(exc), "provider": settings.database_provider}


def describe_database() -> dict[str, Any]:
    return {
        "service": "Relational Cloud Database (local emulator)",
        "provider": settings.database_provider,
        "engine": "SQLite (WAL) via SQLAlchemy 2.x" if settings.database_provider == "local"
        else "Managed PostgreSQL",
        "multi_az": settings.database_provider != "local",
        "auto_backup": settings.database_provider != "local",
        "pool_size": 10,
        "max_overflow": 20,
        "features": [
            "ACID transactions",
            "enforced foreign keys",
            "composite indexes on hot read paths",
            "unique constraints for idempotent likes/follows",
        ],
    }


def table_counts() -> dict[str, int]:
    """Row counts per table - powers the 'cloud database' admin panel."""
    from sqlalchemy import inspect

    inspector = inspect(engine)
    counts: dict[str, int] = {}
    with SessionLocal() as session:
        for table in inspector.get_table_names():
            try:
                counts[table] = session.execute(
                    text(f"SELECT COUNT(*) FROM {table}")
                ).scalar_one()
            except Exception:  # pragma: no cover
                counts[table] = -1
    return counts


def all_tables() -> Sequence[str]:
    from sqlalchemy import inspect

    return sorted(inspect(engine).get_table_names())
