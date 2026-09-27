#!/usr/bin/env python
"""
Local development entrypoint.

    python run.py                 # http://127.0.0.1:8000
    python run.py --port 9000
    python run.py --reset         # drop, recreate and re-seed the database
    python run.py --seed          # seed only if empty
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(BACKEND_ROOT))


def main() -> int:
    parser = argparse.ArgumentParser(description="HobbyLog Cloud API runner")
    parser.add_argument("--host", default=None)
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--reload", action="store_true", help="auto-reload on change")
    parser.add_argument("--reset", action="store_true", help="recreate + reseed the database")
    parser.add_argument("--seed", action="store_true", help="seed only if the database is empty")
    args = parser.parse_args()

    import uvicorn

    from app.config import settings
    from app.database import Base, engine

    if args.reset:
        from app.seed import reset_database

        print("Resetting database...")
        Base.metadata.drop_all(bind=engine)
        reset_database()
        print("Database ready.")
    elif args.seed:
        from app.seed import seed_if_empty

        seed_if_empty()
        print("Seed check complete.")

    uvicorn.run(
        "app.main:app",
        host=args.host or settings.host,
        port=args.port or settings.port,
        reload=args.reload,
        log_level="info",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
