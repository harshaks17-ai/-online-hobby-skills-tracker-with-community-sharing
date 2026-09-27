"""Object storage: validation, public URLs, signed URLs and the bucket view."""

from __future__ import annotations

import io

from PIL import Image


def _png(width: int = 8, height: int = 8) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), (99, 102, 241)).save(buffer, format="PNG")
    return buffer.getvalue()


def test_upload_stores_an_image_and_records_its_checksum(client, account, upload_png):
    uploaded = upload_png()
    assert len(uploaded["checksum"]) == 64
    assert uploaded["storage_path"].startswith("users/")


def test_public_object_url_serves_the_bytes(client, account, upload_png):
    uploaded = upload_png()
    response = client.get(uploaded["url"])
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/")
    assert len(response.content) > 0


def test_an_executable_renamed_to_png_is_rejected(client, account):
    response = client.post(
        "/api/files/upload",
        files={"file": ("payload.exe", b"MZ\x90\x00\x03", "image/png")},
        data={"scope": "proof", "visibility": "public"},
        headers=account["headers"],
    )
    assert response.status_code == 415


def test_a_png_header_with_a_garbage_body_is_rejected(client, account):
    response = client.post(
        "/api/files/upload",
        files={"file": ("broken.png", b"\x89PNG\r\nnot-a-real-png\x00\x00", "image/png")},
        data={"scope": "proof", "visibility": "public"},
        headers=account["headers"],
    )
    assert response.status_code == 415


def test_a_content_type_outside_the_allow_list_is_rejected(client, account):
    response = client.post(
        "/api/files/upload",
        files={"file": ("xss.png", b"<script>alert(1)</script>", "text/html")},
        data={"scope": "proof", "visibility": "public"},
        headers=account["headers"],
    )
    assert response.status_code == 415


def test_an_unknown_upload_scope_is_rejected(client, account):
    response = client.post(
        "/api/files/upload",
        files={"file": ("proof.png", _png(), "image/png")},
        data={"scope": "etc", "visibility": "public"},
        headers=account["headers"],
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_scope"


def test_bucket_inventory_lists_the_objects(client, account, upload_png):
    upload_png()
    body = client.get("/api/files/bucket", headers=account["headers"]).json()
    assert body["object_count"] >= 1
    assert "provider" in body
    assert "pass1234" not in str(body)


def test_private_upload_is_served_through_an_expiring_signed_url(client, account, upload_png):
    private = upload_png(filename="secret.png", content=_png(4, 4), visibility="private")
    signed = private["url"]
    assert "/api/files/signed/" in signed

    resolved = client.get(signed)
    assert resolved.status_code == 200
    assert len(resolved.content) > 0

    head, expiry, signature = signed.rsplit("/", 1)[-1].split(".")

    rewritten = client.get(f"/api/files/signed/{head}.0000000000.{signature}")
    assert rewritten.status_code == 403

    forged = client.get(f"/api/files/signed/{head}.{expiry}.{'0' * 40}")
    assert forged.status_code == 403


def test_signed_token_cannot_be_reused_across_objects(client, account, upload_png):
    first = upload_png(filename="one.png", visibility="private")
    second = upload_png(filename="two.png", visibility="private")
    first_head = first["url"].rsplit("/", 1)[-1].split(".")[0]
    second_parts = second["url"].rsplit("/", 1)[-1].split(".")
    crossed = client.get(f"/api/files/signed/{first_head}.{second_parts[1]}.{second_parts[2]}")
    assert crossed.status_code in (403, 404)


def test_upload_requires_authentication(client):
    response = client.post(
        "/api/files/upload",
        files={"file": ("proof.png", _png(), "image/png")},
        data={"scope": "proof", "visibility": "public"},
    )
    assert response.status_code == 401


def test_my_upload_list_only_shows_my_objects(client, account, other, upload_png):
    uploaded = upload_png()
    mine = client.get("/api/files", headers=account["headers"]).json()
    assert uploaded["id"] in {item["id"] for item in mine["items"]}

    theirs = client.get("/api/files", headers=other["headers"]).json()
    assert uploaded["id"] not in {item["id"] for item in theirs["items"]}


def test_upload_can_be_deleted(client, account, upload_png):
    uploaded = upload_png()
    deleted = client.delete(f"/api/files/{uploaded['id']}", headers=account["headers"])
    assert deleted.status_code == 200
    assert client.get(uploaded["url"]).status_code in (403, 404)
