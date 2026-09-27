"""Uniform API error envelope.

Every failure leaves the API in exactly the same shape, which is what the React
client's `api.js` interceptor expects:

    { "error": { "code": "skill_not_found", "message": "...", "details": {...} } }
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse


class APIError(HTTPException):
    """Base class for every deliberate, client-facing failure."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "bad_request"
    message: str = "Request could not be processed."

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        status_code: int | None = None,
        details: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.code = code or self.code
        self.status_code = status_code or self.status_code
        self.message = message or self.message
        self.details = details or {}
        super().__init__(status_code=self.status_code, detail=self.message, headers=headers)

    def payload(self) -> dict[str, Any]:
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details,
            }
        }


class ValidationError(APIError):
    status_code = 422
    code = "validation_error"
    message = "The submitted data is invalid."


class AuthError(APIError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "unauthorized"
    message = "Authentication required."


class ForbiddenError(APIError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "forbidden"
    message = "You do not have permission to perform this action."


class NotFoundError(APIError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"
    message = "The requested resource was not found."


class ConflictError(APIError):
    status_code = status.HTTP_409_CONFLICT
    code = "conflict"
    message = "The resource already exists."


class PayloadTooLargeError(APIError):
    status_code = 413
    code = "payload_too_large"
    message = "The uploaded file is too large."


class UnsupportedMediaError(APIError):
    status_code = status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
    code = "unsupported_media_type"
    message = "That file type is not allowed."


class RateLimitError(APIError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    code = "rate_limited"
    message = "Too many requests. Please slow down."


class ServiceUnavailableError(APIError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "service_unavailable"
    message = "A dependent cloud service is temporarily unavailable."


def register_exception_handlers(app) -> None:
    """Wire handlers so *every* error path returns the same JSON envelope."""

    @app.exception_handler(APIError)
    async def _api_error(_request: Request, exc: APIError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content=exc.payload(), headers=exc.headers
        )

    @app.exception_handler(HTTPException)
    async def _http_error(_request: Request, exc: HTTPException) -> JSONResponse:
        code = {
            401: "unauthorized",
            403: "forbidden",
            404: "not_found",
            405: "method_not_allowed",
            409: "conflict",
            422: "validation_error",
            429: "rate_limited",
        }.get(exc.status_code, "http_error")
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": code, "message": str(exc.detail), "details": {}}},
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    async def _unhandled(_request: Request, exc: Exception) -> JSONResponse:
        # Never leak a stack trace to a client; the full trace goes to the log.
        import logging

        logging.getLogger("hobbylog.api").exception("Unhandled server error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "internal_error",
                    "message": "Something went wrong on our side. Please try again.",
                    "details": {},
                }
            },
        )
