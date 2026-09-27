"""
File / image uploads through the object-storage abstraction.

Validation pipeline (in order, cheapest first):
    1. declared size limit            -> 413
    2. content-type allow-list        -> 415
    3. extension allow-list           -> 415
    4. magic-byte sniffing            -> 415   (defeats renamed .exe uploads)
    5. Pillow decode of real images   -> 415   (defeats a valid header + garbage body)
    6. SHA-256 checksum recorded for integrity / dedupe

Private objects are never returned as a bare URL: the API hands back an expiring
signed URL instead, exactly as Cloud Storage presigned URLs behave.
"""

from __future__ import annotations

import mimetypes
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import FileAsset, User
from app.utils.errors import (
    NotFoundError,
    PayloadTooLargeError,
    UnsupportedMediaError,
    ValidationError,
)
from cloud import storage_service

IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}

# Magic bytes: offset -> expected prefix (first 12 bytes is plenty).
_SIGNATURES: list[tuple[tuple[int, ...], str]] = [
    ((0x89, 0x50, 0x4E, 0x47), "image/png"),
    ((0xFF, 0xD8, 0xFF), "image/jpeg"),
    ((0x47, 0x49, 0x46, 0x38), "image/gif"),
    ((0x25, 0x50, 0x44, 0x46), "application/pdf"),
    ((0x49, 0x44, 0x33), "audio/mpeg"),
]


def _sniff(data: bytes) -> str | None:
    for signature, content_type in _SIGNATURES:
        offset, expected = signature[0], bytes(signature)
        if data[offset : offset + len(expected)] == expected:
            return content_type
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[4:8] == b"ftyp":
        return "video/mp4"
    return None


def _validate_image(data: bytes) -> None:
    """Decode with Pillow so a truncated or non-image payload is rejected."""
    try:
        from io import BytesIO

        from PIL import Image

        with Image.open(BytesIO(data)) as image:
            image.verify()
    except UnsupportedMediaError:
        raise
    except Exception as exc:  # noqa: BLE001 - any decode failure is a 415
        raise UnsupportedMediaError(
            "That file is not a valid image.", code="corrupt_image"
        ) from exc


def upload_file(
    db: Session,
    user: User,
    filename: str,
    content: bytes,
    content_type: str,
    scope: str = "misc",
    visibility: str = "public",
) -> dict[str, Any]:
    if not content:
        raise ValidationError("The uploaded file is empty.", code="empty_file")
    if len(content) > settings.max_upload_bytes:
        raise PayloadTooLargeError(
            f"Maximum upload size is {settings.max_upload_bytes // (1024 * 1024)} MB.",
            code="file_too_large",
        )

    declared = (content_type or "").split(";")[0].strip().lower()
    if declared not in settings.allowed_types:
        raise UnsupportedMediaError(
            f"'{declared or 'unknown'}' uploads are not allowed.", code="type_not_allowed"
        )

    sniffed = _sniff(content)
    extension = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if declared in IMAGE_TYPES:
        if extension and extension not in IMAGE_EXTENSIONS:
            raise UnsupportedMediaError(
                f"'{extension}' does not match an image upload.", code="extension_mismatch"
            )
        _validate_image(content)
        sniffed = sniffed or declared
    elif sniffed is None:
        raise UnsupportedMediaError(
            "The file contents do not match the declared type.", code="signature_mismatch"
        )

    key = storage_service.build_object_key(user.id, scope, filename)
    stored = storage_service.put_object(key, content, declared)
    url = (
        storage_service.get_public_url(key)
        if visibility == "public"
        else storage_service.sign_url(key)
    )

    asset = FileAsset(
        user_id=user.id,
        owner_scope=scope,
        original_name=filename[:255],
        storage_path=key,
        content_type=declared,
        size_bytes=len(content),
        url=url,
        visibility=visibility,
        checksum=stored["checksum"],
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return serialise_file(asset)


def list_files(db: Session, user: User, scope: str | None = None) -> list[dict[str, Any]]:
    statement = select(FileAsset).where(FileAsset.user_id == user.id)
    if scope:
        statement = statement.where(FileAsset.owner_scope == scope)
    rows = db.scalars(statement.order_by(FileAsset.created_at.desc())).all()
    return [serialise_file(row) for row in rows]


def get_file(db: Session, file_id: str, user: User) -> FileAsset:
    asset = db.get(FileAsset, file_id)
    if asset is None:
        raise NotFoundError("File not found.", code="file_not_found")
    if asset.user_id != user.id:
        raise NotFoundError("File not found.", code="file_not_found")
    return asset


def delete_file(db: Session, file_id: str, user: User) -> None:
    asset = get_file(db, file_id, user)
    # Remove the object first: an orphaned row is harmless, an orphaned object
    # silently consumes storage forever.
    storage_service.delete_object(asset.storage_path)
    db.delete(asset)
    db.commit()


def serialise_file(asset: FileAsset) -> dict[str, Any]:
    return {
        "id": asset.id,
        "user_id": asset.user_id,
        "owner_scope": asset.owner_scope,
        "original_name": asset.original_name,
        "storage_path": asset.storage_path,
        "content_type": asset.content_type,
        "size_bytes": asset.size_bytes,
        "url": asset.url,
        "visibility": asset.visibility,
        "checksum": asset.checksum,
        "created_at": asset.created_at,
        "signed_url": (
            storage_service.sign_url(asset.storage_path)
            if asset.visibility != "public"
            else None
        ),
    }


def resolve_content_type(filename: str, fallback: str) -> str:
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or fallback
