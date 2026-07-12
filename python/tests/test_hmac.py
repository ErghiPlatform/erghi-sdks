"""Tests for erghi.hmac — identity hash generation and webhook signature verification."""

import pytest

from erghi import generate_identity_hash, verify_webhook_signature

SECRET = "whsec_testSecretKey1234567890abcdef"


class TestGenerateIdentityHash:
    def test_returns_64_char_lowercase_hex(self) -> None:
        digest = generate_identity_hash("visitor-123", SECRET)
        assert len(digest) == 64
        assert digest == digest.lower()
        int(digest, 16)  # raises ValueError if not valid hex

    def test_is_deterministic(self) -> None:
        a = generate_identity_hash("visitor-abc", SECRET)
        b = generate_identity_hash("visitor-abc", SECRET)
        assert a == b

    def test_differs_for_different_visitor_ids(self) -> None:
        a = generate_identity_hash("visitor-1", SECRET)
        b = generate_identity_hash("visitor-2", SECRET)
        assert a != b

    def test_differs_for_different_secrets(self) -> None:
        a = generate_identity_hash("visitor-1", "secret-A")
        b = generate_identity_hash("visitor-1", "secret-B")
        assert a != b

    def test_raises_for_empty_visitor_id(self) -> None:
        with pytest.raises(ValueError):
            generate_identity_hash("", SECRET)

    def test_matches_known_vector(self) -> None:
        # Independently computed: hmac.new(b"whsec_testSecretKey1234567890abcdef",
        # b"visitor-123", hashlib.sha256).hexdigest()
        import hashlib
        import hmac as stdlib_hmac

        expected = stdlib_hmac.new(
            SECRET.encode("utf-8"), b"visitor-123", hashlib.sha256
        ).hexdigest()
        assert generate_identity_hash("visitor-123", SECRET) == expected


class TestVerifyWebhookSignature:
    def test_accepts_valid_signature(self) -> None:
        payload = "test-payload"
        signature = generate_identity_hash(payload, SECRET)
        assert verify_webhook_signature(payload, signature, SECRET) is True

    def test_rejects_wrong_signature(self) -> None:
        assert verify_webhook_signature("payload", "wrongsig", SECRET) is False

    def test_rejects_tampered_payload(self) -> None:
        signature = generate_identity_hash("original", SECRET)
        assert verify_webhook_signature("tampered", signature, SECRET) is False

    def test_rejects_empty_inputs(self) -> None:
        assert verify_webhook_signature("", "sig", SECRET) is False
        assert verify_webhook_signature("payload", "", SECRET) is False
        assert verify_webhook_signature("payload", "sig", "") is False
