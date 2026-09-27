"""Pure unit tests for the helpers the API leans on - no HTTP involved."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.config import settings
from app.services.goal_service import auto_milestones, minutes_to_unit
from app.utils.helpers import compute_streak, level_from_minutes, progress_percent, slugify
from app.utils.security import TokenError, create_token, decode_token, hash_password, verify_password
from cloud.storage_service import sign_url, verify_signed_url


def _token_key(url: str) -> str:
    """``sign_url`` returns a full path; ``verify_signed_url`` wants the token."""
    return url.rsplit("/", 1)[-1]


# --------------------------------------------------------------- progress --


@pytest.mark.parametrize(
    ("current", "target", "expected"),
    [(0, 100, 0.0), (50, 100, 50.0), (150, 100, 100.0), (1, 3, 33.3)],
    ids=["empty", "half", "over", "third"],
)
def test_progress_percent(current, target, expected):
    assert progress_percent(current, target) == pytest.approx(expected, abs=0.05)


def test_progress_percent_never_divides_by_zero():
    assert progress_percent(10, 0) == 0.0
    assert progress_percent(0, 0) == 0.0


@pytest.mark.parametrize(
    ("minutes", "unit", "expected"),
    [(60, "minutes", 60.0), (60, "hours", 1.0), (90, "hours", 1.5), (75, "sessions", 75.0)],
)
def test_minutes_to_unit(minutes, unit, expected):
    assert minutes_to_unit(minutes, unit) == pytest.approx(expected)


def test_hours_goals_get_four_evenly_spaced_milestones():
    milestones = auto_milestones(10, "hours")
    assert [m["target_value"] for m in milestones] == [2.5, 5, 7.5, 10]
    assert len({m["title"] for m in milestones}) == 4


# ----------------------------------------------------------------- streaks --


def test_streak_counts_consecutive_days_including_today():
    today = date(2026, 9, 27)
    days = [today, today - timedelta(days=1), today - timedelta(days=2)]
    current, longest = compute_streak(days, today)
    assert current == 3
    assert longest == 3


def test_streak_survives_yesterday_but_breaks_after_a_gap():
    today = date(2026, 9, 27)
    assert compute_streak([today - timedelta(days=1)], today)[0] == 1
    assert compute_streak([today - timedelta(days=3)], today)[0] == 0


def test_streak_of_nothing_is_zero():
    assert compute_streak([], date(2026, 9, 27)) == (0, 0)


# ------------------------------------------------------------ credentials --


def test_password_hash_round_trips_and_rejects_the_wrong_password():
    stored = hash_password("Password123")
    assert stored != "Password123"
    assert "Password123" not in stored
    assert verify_password("Password123", stored) is True
    assert verify_password("Password124", stored) is False


def test_identical_passwords_produce_different_hashes():
    assert hash_password("Password123") != hash_password("Password123")


def test_access_tokens_cannot_be_reused_as_refresh_tokens():
    access = create_token("user-1", token_type="access", expires_delta=timedelta(minutes=5))
    assert decode_token(access)["sub"] == "user-1"
    with pytest.raises(TokenError):
        decode_token(access, expected_type="refresh")


def test_a_forged_signature_is_rejected():
    access = create_token("user-1", token_type="access")
    head, body, signature = access.split(".")
    with pytest.raises(TokenError):
        decode_token(f"{head}.{body}.{'0' * len(signature)}")


def test_decoding_garbage_is_a_token_error():
    with pytest.raises(TokenError):
        decode_token("not.a-token")


# ----------------------------------------------------------------- storage --


def test_signed_url_round_trips_to_the_original_key():
    url = sign_url("users/abc/proof/x.png", ttl_seconds=3600)
    assert url.startswith("/api/files/signed/")
    assert verify_signed_url(_token_key(url)) == "users/abc/proof/x.png"


def test_signed_url_rejects_a_forged_signature():
    encoded_key, expiry, _ = _token_key(sign_url("users/abc/proof/x.png", ttl_seconds=3600)).split(".", 2)
    with pytest.raises(ValueError):
        verify_signed_url(f"{encoded_key}.{expiry}.{'0' * 40}")


def test_signed_url_rejects_an_expired_token():
    with pytest.raises(ValueError):
        verify_signed_url(_token_key(sign_url("users/abc/proof/x.png", ttl_seconds=-1)))


def test_signed_url_rejects_a_malformed_token():
    with pytest.raises(ValueError):
        verify_signed_url("not-a-token")


# ------------------------------------------------------------------- misc --


@pytest.mark.parametrize(
    ("minutes", "expected"),
    [(0, "BEGINNER"), (599, "BEGINNER"), (600, "INTERMEDIATE"), (2400, "ADVANCED")],
    ids=["nothing", "just-under-10h", "10-hours", "40-hours"],
)
def test_level_from_minutes(minutes, expected):
    assert level_from_minutes(minutes) == expected


def test_slugify_normalises_titles():
    assert slugify("Hello World") == "hello-world"
    assert slugify("C# and Rust") == "c--and-rust"
    assert slugify("  padded  ") == "padded"


def test_settings_never_use_a_placeholder_secret():
    assert len(settings.secret_key) >= 32
    assert settings.secret_key not in {"change-me", "secret", "dev-secret"}
