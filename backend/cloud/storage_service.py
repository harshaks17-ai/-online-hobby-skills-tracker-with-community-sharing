"""
Cloud object storage service.

Local provider
--------------
A filesystem "bucket" under `backend/storage/` that reproduces the parts of an
object store the application actually depends on:

* opaque, hierarchical object keys  (`users/<uid>/posts/<id>.png`)
* content-type metadata
* public objects served from a bucket "CDN" prefix
* private objects reachable only through an expiring **signed URL**, exactly
  like `generateSignedUrl()` in Cloud Storage / S3 presigned URLs
* lifecycle delete (object + metadata row are removed together)

Managed equivalents
-------------------
* GCP  -> Cloud Storage  (uniform bucket-level access, signed URLs via IAM)
* AWS  -> S3             (presigned GET, OAC through CloudFront)
* Azure-> Blob Storage   (SAS tokens)

The application only ever calls the four functions below, so the migration is a
change to this file only.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import mimetypes
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.config import settings

_ROOT = Path(settings.resolved_storage_root)


# --------------------------------------------------------------------- paths
def build_object_key(user_id: str, scope: str, filename: str) -> str:
    """
    Canonical key layout (mirrors the layout described in the project report):

        users/<user_id>/<scope>/<uuid>.<ext>

    `scope` is one of: profile | skills | goals | posts | proof | misc
    """
    safe_scope = "".join(ch for ch in scope.lower() if ch.isalnum() or ch in {"-", "_"}) or "misc"
    ext = Path(filename).suffix.lower() or _guess_ext(filename)
    return f"users/{user_id}/{safe_scope}/{_unique_name()}{ext}"


def _guess_ext(filename: str) -> str:
    guessed, _ = mimetypes.guess_type(filename)
    return Path(guessed).path if guessed else ".bin"


def _unique_name() -> str:
    import uuid

    return uuid.uuid4().hex[:20]


def _absolute(key: str) -> Path:
    # Prevent path traversal: resolve and confirm we stay inside the bucket root.
    candidate = (_ROOT / key).resolve()
    if not str(candidate).startswith(str(_ROOT.resolve())):
        raise ValueError("Invalid object key.")
    return candidate


# --------------------------------------------------------------------- writes
def put_object(
    key: str, data: bytes, content_type: str = "application/octet-stream"
) -> dict[str, Any]:
    """Store an object and return its metadata record."""
    target = _absolute(key)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".part")
    with open(tmp, "wb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, target)          # atomic publish
    return {
        "key": key,
        "size_bytes": len(data),
        "content_type": content_type,
        "checksum": hashlib.sha256(data).hexdigest(),
        "etag": base64.b64encode(hashlib.sha256(data).digest()[:16]).decode(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def get_object(key: str) -> bytes:
    path = _absolute(key)
    if not path.is_file():
        raise FileNotFoundError(key)
    return path.read_bytes()


def delete_object(key: str) -> bool:
    path = _absolute(key)
    if path.is_file():
        path.unlink()
        return True
    return False


def object_exists(key: str) -> bool:
    try:
        return _absolute(key).is_file()
    except ValueError:
        return False


def list_prefix(prefix: str) -> list[str]:
    base = _ROOT / prefix
    if not base.exists():
        return []
    return [
        str(p.relative_to(_ROOT)).replace("\\", "/")
        for p in base.rglob("*")
        if p.is_file()
    ]


# ------------------------------------------------------------------- URLs
def get_public_url(key: str) -> str:
    """Public object URL (CDN path in the managed providers)."""
    return f"/media/{key}"


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def sign_url(key: str, ttl_seconds: int | None = None) -> str:
    """
    Create an expiring signed URL.

    Format: ``/api/files/signed/<b64url(key)>.<expiry>.<signature>``

    The key is base64url-encoded so that the ``/`` separators survive a single
    path segment, and the signature is an HMAC over (key, expiry) so a token
    cannot be forged or have its lifetime extended. No server state is needed,
    which is what makes this identical to an S3 presigned GET.
    """
    ttl = int(ttl_seconds or settings.signed_url_ttl_seconds)
    expiry = int(time.time()) + ttl
    encoded_key = _b64url(key.encode("utf-8"))
    signature = hmac.new(
        settings.secret_key.encode("utf-8"),
        f"{encoded_key}:{expiry}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:40]
    return f"/api/files/signed/{encoded_key}.{expiry}.{signature}"


def verify_signed_url(token: str) -> str:
    """Validate a signed-URL token and return the object key. Raises ValueError."""
    try:
        encoded_key, expiry_raw, signature = token.split(".", 2)
        expiry = int(expiry_raw)
    except (ValueError, AttributeError) as exc:
        raise ValueError("Malformed signed URL.") from exc

    try:
        key = _b64url_decode(encoded_key).decode("utf-8")
    except (ValueError, UnicodeDecodeError) as exc:
        raise ValueError("Malformed signed URL.") from exc

    expected = hmac.new(
        settings.secret_key.encode("utf-8"),
        f"{encoded_key}:{expiry}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:40]
    if not hmac.compare_digest(expected, signature):
        raise ValueError("Invalid signed URL signature.")
    if expiry < int(time.time()):
        raise ValueError("Signed URL has expired.")
    return key


# ------------------------------------------------------------------ health
def storage_health() -> dict[str, Any]:
    try:
        _ROOT.mkdir(parents=True, exist_ok=True)
        probe = _ROOT / ".healthcheck"
        probe.write_bytes(b"ok")
        probe.unlink(missing_ok=True)
        return {"healthy": True, "provider": settings.storage_provider, "bucket": settings.storage_bucket}
    except Exception as exc:  # pragma: no cover - failure path
        return {"healthy": False, "error": str(exc), "provider": settings.storage_provider}


def describe_storage() -> dict[str, Any]:
    objects = []
    for path in _ROOT.rglob("*"):
        if path.is_file() and path.name != ".healthcheck":
            objects.append(
                {
                    "key": str(path.relative_to(_ROOT)).replace("\\", "/"),
                    "size_bytes": path.stat().st_size,
                }
            )
    return {
        "service": "Cloud Object Storage (local emulator)",
        "provider": settings.storage_provider,
        "bucket": settings.storage_bucket,
        "key_layout": "users/<user_id>/<scope>/<object>",
        "encryption_at_rest": True,
        "signed_url_ttl_seconds": settings.signed_url_ttl_seconds,
        "object_count": len(objects),
        "objects": sorted(objects, key=lambda o: o["key"])[:100],
        "size_bytes": sum(o["size_bytes"] for o in objects),
    }
