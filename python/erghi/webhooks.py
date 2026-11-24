"""Verify the Standard Webhooks signature on a reply-engine delivery (server-side).

Erghi signs reply-engine webhooks (``turn.requested`` and the informational events) and workspace
webhooks the Standard Webhooks way (https://standardwebhooks.com): headers ``webhook-id``,
``webhook-timestamp`` (Unix seconds) and ``webhook-signature`` (one or more space-separated
``v1,<base64>``), the signature being HMAC-SHA256 of ``{id}.{timestamp}.{raw_body}`` keyed with the
base64 bytes after the ``whsec_`` prefix. During a secret rotation Erghi signs with both secrets,
so any matching entry is enough. Verify the RAW body before parsing it.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import time
from typing import Mapping, Optional, Union

from .errors import ErghiError
from .reply_types import TurnRequest

ID_HEADER = "webhook-id"
TIMESTAMP_HEADER = "webhook-timestamp"
SIGNATURE_HEADER = "webhook-signature"
DEFAULT_TOLERANCE_SECONDS = 300


class WebhookVerificationError(ErghiError):
    """The delivery cannot be trusted. ``reason`` is one of ``missing_headers``, ``bad_timestamp``,
    ``timestamp_too_old``, ``timestamp_in_future``, ``no_matching_signature``."""

    def __init__(self, reason: str) -> None:
        super().__init__(f"Webhook verification failed: {reason}", "WEBHOOK_VERIFICATION_FAILED")
        self.reason = reason


def _key(secret: str) -> bytes:
    if not secret or not secret.strip():
        raise ValueError("secret is required")
    raw = secret.removeprefix("whsec_")
    try:
        return base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("The signing secret is not a valid whsec_ secret") from None


def _body_text(body: Union[str, bytes]) -> str:
    return body.decode("utf-8") if isinstance(body, (bytes, bytearray)) else body


def sign(secret: str, webhook_id: str, timestamp: int, body: Union[str, bytes]) -> str:
    """The ``webhook-signature`` value Erghi would send. Useful in your own tests."""
    signed = f"{webhook_id}.{timestamp}.{_body_text(body)}".encode()
    digest = hmac.new(_key(secret), signed, hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode("ascii")


def _header(headers: Mapping[str, str], name: str) -> Optional[str]:
    for key, value in headers.items():
        if key.lower() == name:
            return value
    return None


def verify_webhook(
    secret: str,
    headers: Mapping[str, str],
    body: Union[str, bytes],
    *,
    tolerance_seconds: int = DEFAULT_TOLERANCE_SECONDS,
    now: Optional[float] = None,
) -> None:
    """Raise ``WebhookVerificationError`` unless the delivery is authentic and fresh.

    ``headers`` is any mapping (names are matched case-insensitively), ``body`` the raw request
    body. Deliveries more than ``tolerance_seconds`` (default 5 minutes) off ``now`` are rejected.
    A malformed ``secret`` raises ``ValueError`` (a programming error, not a bad delivery).
    """
    key = _key(secret)
    webhook_id = _header(headers, ID_HEADER)
    timestamp = _header(headers, TIMESTAMP_HEADER)
    signature = _header(headers, SIGNATURE_HEADER)
    if not webhook_id or not timestamp or not signature:
        raise WebhookVerificationError("missing_headers")
    if not (timestamp.isascii() and timestamp.isdigit()):
        raise WebhookVerificationError("bad_timestamp")

    age = (time.time() if now is None else now) - int(timestamp)
    if age > tolerance_seconds:
        raise WebhookVerificationError("timestamp_too_old")
    if -age > tolerance_seconds:
        raise WebhookVerificationError("timestamp_in_future")

    signed = f"{webhook_id}.{int(timestamp)}.{_body_text(body)}".encode()
    expected = hmac.new(key, signed, hashlib.sha256).digest()
    matched = False
    for part in signature.split():
        version, _, value = part.partition(",")
        if version != "v1":
            continue
        try:
            candidate = base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError):
            continue
        # Check every entry (no early exit) so timing does not reveal which one matched.
        matched |= hmac.compare_digest(candidate, expected)
    if not matched:
        raise WebhookVerificationError("no_matching_signature")


def is_valid_webhook(
    secret: str,
    headers: Mapping[str, str],
    body: Union[str, bytes],
    *,
    tolerance_seconds: int = DEFAULT_TOLERANCE_SECONDS,
    now: Optional[float] = None,
) -> bool:
    """Like ``verify_webhook`` but returns a bool."""
    try:
        verify_webhook(secret, headers, body, tolerance_seconds=tolerance_seconds, now=now)
    except WebhookVerificationError:
        return False
    return True


def parse_turn_webhook(
    secret: str,
    headers: Mapping[str, str],
    body: Union[str, bytes],
    *,
    tolerance_seconds: int = DEFAULT_TOLERANCE_SECONDS,
    now: Optional[float] = None,
) -> TurnRequest:
    """Verify the delivery, then parse its body as a ``turn.requested`` turn."""
    verify_webhook(secret, headers, body, tolerance_seconds=tolerance_seconds, now=now)
    return TurnRequest.model_validate_json(body)
