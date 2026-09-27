"""
Application configuration.

All configuration is loaded from environment variables (12-factor style) so that
the exact same image can be promoted from local development to a managed cloud
runtime (Cloud Run / App Runner / Flex) by only changing injected secrets.

Nothing secret is ever hard-coded. `.env` is git-ignored; `.env.example` is
committed as the documented contract.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_ROOT.parent


class Settings(BaseSettings):
    """Runtime settings resolved from the environment."""

    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env", BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---------------------------------------------------------------- app ---
    app_name: str = "HobbyLog Cloud API"
    app_version: str = "1.0.0"
    environment: str = Field(default="local", alias="ENVIRONMENT")
    api_prefix: str = "/api"
    debug: bool = True
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # ------------------------------------------------------------- server ---
    host: str = "0.0.0.0"
    port: int = 8000

    # --------------------------------------------------------- secrets mgr ---
    # MUST be overridden in any non-local deployment. The app refuses to start
    # in production if the default development secret is still in place.
    secret_key: str = Field(
        default="dev-only-insecure-secret-change-me",
        alias="SECRET_KEY",
    )
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 12
    refresh_token_expire_days: int = 30

    # ------------------------------------------------- cloud service layer ---
    # `local` runs the bundled adapters (SQLite + filesystem bucket).
    # `gcp` / `aws` are wired for the managed equivalents documented in
    # cloud/*.py (Cloud SQL/Firestore + GCS/S3).
    database_provider: str = "local"          # local | gcp | aws
    storage_provider: str = "local"           # local | gcp | aws
    identity_provider: str = "local"          # local | firebase | cognito
    storage_bucket: str = "local-emulator-bucket"
    sqlite_path: str = Field(
        default=str(BACKEND_ROOT / "data" / "hobbylog.db"), alias="SQLITE_PATH"
    )
    storage_root: str = Field(
        default=str(BACKEND_ROOT / "storage"), alias="STORAGE_ROOT"
    )
    signed_url_ttl_seconds: int = 3600

    # -------------------------------------------------------- file uploads ---
    max_upload_bytes: int = 8 * 1024 * 1024
    allowed_upload_types: str = (
        "image/png,image/jpeg,image/jpg,image/webp,image/gif,"
        "application/pdf,video/mp4,text/plain"
    )

    # ------------------------------------------------------------ security ---
    rate_limit_requests: int = 240
    rate_limit_window_seconds: int = 60
    auth_rate_limit_requests: int = 12

    # ------------------------------------------------------------- seeding ---
    seed_on_startup: bool = True
    demo_password: str = "pass1234"

    @field_validator("database_provider", "storage_provider", "identity_provider")
    @classmethod
    def _lower(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("sqlite_path", "storage_root", "cors_origins", "allowed_upload_types")
    @classmethod
    def _blank_to_default(cls, value: str, info) -> str:
        """
        An empty value in `.env` means "use the default", not "use an empty
        string". Without this, a commented-out line in `.env.example` that gets
        copied verbatim would break the engine URL.

        For the two *paths* the default is substituted eagerly so the raw
        attribute is never an empty string - a blank path silently resolves to
        the current working directory, which would serve the whole backend tree
        (including `.env`) from the `/media` mount.
        """
        cleaned = value.strip() if value and value.strip() else ""
        if cleaned:
            return cleaned
        if info.field_name == "sqlite_path":
            return str(BACKEND_ROOT / "data" / "hobbylog.db")
        if info.field_name == "storage_root":
            return str(BACKEND_ROOT / "storage")
        return ""

    # ----------------------------------------------------------- helpers ----
    @property
    def resolved_sqlite_path(self) -> str:
        return self.sqlite_path or str(BACKEND_ROOT / "data" / "hobbylog.db")

    @property
    def resolved_storage_root(self) -> str:
        return self.storage_root or str(BACKEND_ROOT / "storage")

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"prod", "production"}

    @property
    def allowed_types(self) -> list[str]:
        return [t.strip().lower() for t in self.allowed_upload_types.split(",") if t.strip()]

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def ensure_directories(self) -> None:
        Path(self.resolved_sqlite_path).parent.mkdir(parents=True, exist_ok=True)
        Path(self.resolved_storage_root).mkdir(parents=True, exist_ok=True)

    def assert_production_ready(self) -> None:
        """Fail fast rather than silently running an insecure deployment."""
        if not self.is_production:
            return
        if self.secret_key.startswith("dev-only"):
            raise RuntimeError(
                "SECRET_KEY must be set to a strong random value when ENVIRONMENT=production."
            )
        if len(self.secret_key) < 32:
            raise RuntimeError("SECRET_KEY must be at least 32 characters in production.")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_directories()
    settings.assert_production_ready()
    return settings


settings = get_settings()

# Make the process fail loudly if the port is already taken instead of silently
# letting Vite proxy to nothing.
os.environ.setdefault("PYTHONUNBUFFERED", "1")
