"""Cloud object storage endpoints: /api/files"""

from __future__ import annotations

from fastapi import APIRouter, File, Form, Query, Response, UploadFile, status

from app.middleware.auth import CurrentUser, DbSession
from app.schemas import MessageResponse
from app.services import file_service
from app.utils.errors import NotFoundError, ValidationError
from cloud import storage_service

router = APIRouter(prefix="/files", tags=["Files"])


@router.post("/upload", status_code=status.HTTP_201_CREATED, summary="Upload a file / image")
async def upload(
    file: UploadFile = File(...),
    scope: str = Form(default="misc"),
    visibility: str = Form(default="public"),
    user: CurrentUser = None,  # type: ignore[assignment]
    db: DbSession = None,  # type: ignore[assignment]
) -> dict:
    """
    multipart/form-data upload.

    Validation order: size -> declared type -> extension -> magic bytes ->
    full image decode. Anything suspicious is a 4xx, never a 500.
    Private uploads are returned as expiring signed URLs.
    """
    if scope not in {"profile", "skills", "goals", "posts", "proof", "misc"}:
        raise ValidationError("Unknown upload scope.", code="invalid_scope")
    if visibility not in {"public", "private"}:
        raise ValidationError("Visibility must be public or private.", code="invalid_visibility")

    content = await file.read()
    return file_service.upload_file(
        db,
        user,
        filename=file.filename or "upload.bin",
        content=content,
        content_type=file.content_type or "application/octet-stream",
        scope=scope,
        visibility=visibility,
    )


@router.get("", summary="List my uploads")
def list_files(
    scope: str | None = Query(default=None),
    user: CurrentUser = None,  # type: ignore[assignment]
    db: DbSession = None,  # type: ignore[assignment]
) -> dict:
    return {"items": file_service.list_files(db, user, scope)}


@router.get("/bucket", summary="Object storage inventory (cloud console view)")
def bucket(db: DbSession) -> dict:
    """Shows the bucket layout, object count and total bytes - the demo of the
    'metadata in DB, bytes in object storage' separation."""
    return storage_service.describe_storage()


@router.get("/signed/{token}", summary="Resolve a signed URL")
def resolve_signed(token: str) -> Response:
    """
    Public endpoint with no bearer token - possession of a valid, unexpired
    signature *is* the authorisation, which is exactly how a presigned GET URL
    behaves in Cloud Storage / S3.
    """
    from app.utils.errors import ForbiddenError

    try:
        key = storage_service.verify_signed_url(token)
    except ValueError as exc:
        raise ForbiddenError(str(exc), code="invalid_signed_url") from exc
    try:
        data = storage_service.get_object(key)
    except FileNotFoundError as exc:
        raise NotFoundError("Object not found.", code="object_not_found") from exc
    return Response(content=data, media_type="application/octet-stream")


@router.delete("/{file_id}", response_model=MessageResponse, summary="Delete an upload")
def delete_file(file_id: str, user: CurrentUser, db: DbSession) -> MessageResponse:
    file_service.delete_file(db, file_id, user)
    return MessageResponse(message="File deleted from object storage.", data={"id": file_id})
