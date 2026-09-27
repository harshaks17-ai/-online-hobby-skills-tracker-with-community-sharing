"""
Edge-style protections that sit in front of every request.

* `RequestContextMiddleware` - correlation id + access log (structured logging,
  the same shape Cloud Logging / CloudWatch ingest).
* `RateLimitMiddleware`       - fixed-window in-memory limiter, per client IP
  per route class. Documented in the report as "replace with API Gateway /
  Cloud Armor / Cloudflare rate limiting in production".
"""

from __future__ import annotations

import logging
import time
import uuid
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import settings

logger = logging.getLogger("hobbylog.access")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
)

# Routes that must be aggressively throttled to stop credential stuffing.
_SENSITIVE_PREFIXES = ("/api/auth/login", "/api/auth/register", "/api/auth/refresh")


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, requests: int | None = None, window: int | None = None) -> None:
        super().__init__(app)
        self.requests = requests or settings.rate_limit_requests
        self.window = window or settings.rate_limit_window_seconds
        self.sensitive_requests = settings.auth_rate_limit_requests
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def _client_key(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "anonymous"

    async def dispatch(self, request: Request, call_next):
        if request.url.path.startswith("/api"):
            path = request.url.path
            limit = (
                self.sensitive_requests
                if any(path.startswith(p) for p in _SENSITIVE_PREFIXES)
                else self.requests
            )
            bucket_key = f"{self._client_key(request)}:{path if limit == self.sensitive_requests else '*'}"
            now = time.monotonic()
            bucket = self._hits[bucket_key]
            while bucket and now - bucket[0] > self.window:
                bucket.popleft()
            if len(bucket) >= limit:
                retry_after = int(self.window - (now - bucket[0])) + 1
                return JSONResponse(
                    status_code=429,
                    content={
                        "error": {
                            "code": "rate_limited",
                            "message": "Too many requests. Please slow down.",
                            "details": {"retry_after_seconds": retry_after},
                        }
                    },
                    headers={"Retry-After": str(retry_after)},
                )
            bucket.append(now)
        return await call_next(request)


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-Id") or uuid.uuid4().hex[:12]
        started = time.perf_counter()
        response = await call_next(request)
        elapsed = (time.perf_counter() - started) * 1000
        response.headers["X-Request-Id"] = request_id
        response.headers["X-Response-Time-ms"] = f"{elapsed:.1f}"
        # Security headers applied centrally (defence in depth).
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; img-src 'self' data: blob: https:; "
            "media-src 'self' blob:; style-src 'self' 'unsafe-inline'; "
            "script-src 'self'; connect-src 'self'",
        )
        if path_is_secure(request):
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        logger.info(
            "%s %s -> %s (%.1fms) req_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            elapsed,
            request_id,
        )
        return response


def path_is_secure(request: Request) -> bool:
    return request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
