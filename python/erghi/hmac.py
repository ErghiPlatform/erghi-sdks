"""
Erghi Python SDK — HMAC utilities (server-side)

Stateless module-level helpers for generating visitor identity hashes and
verifying webhook signatures. They do not require an ``ErghiClient``
instance. Keep your widgetSecretKey / webhook secret on the server —
never expose it to clients.
"""

from __future__ import annotations

import hashlib
import hmac as hmac_lib


def generate_identity_hash(visitor_id: str, secret_key: str) -> str:
    """
    Generate an HMAC-SHA256 hex digest for a visitor ID.

    Call this server-side to securely link your logged-in user to the Erghi widget.

    Args:
        visitor_id: Your system's user/visitor identifier.
        secret_key: The ``whsec_...`` secret from the Erghi Admin Portal.

    Returns:
        Lowercase hex-encoded HMAC-SHA256 digest (64 characters).

    Raises:
        ValueError: If ``visitor_id`` or ``secret_key`` is empty.

    Example::

        from erghi import generate_identity_hash

        identity_hash = generate_identity_hash(
            visitor_id=str(request.user.id),
            secret_key=settings.ERGHI_WIDGET_SECRET,
        )
    """
    if not visitor_id or not secret_key:
        raise ValueError("visitor_id and secret_key are required")

    digest = hmac_lib.new(
        key=secret_key.encode("utf-8"),
        msg=visitor_id.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()
    return digest


def verify_webhook_signature(payload: str, signature: str, secret: str) -> bool:
    """
    Verify an incoming Erghi webhook signature.

    Erghi signs webhook payloads with ``HMAC-SHA256(raw_body, webhook_secret)``
    and sends the result in the ``X-Erghi-Signature`` header. Always verify
    this before processing webhook events.

    Args:
        payload: The raw request body string (do not parse JSON first).
        signature: The value of the ``X-Erghi-Signature`` header.
        secret: Your workspace webhook secret.

    Returns:
        ``True`` if the signature is valid, ``False`` otherwise.
    """
    if not payload or not signature or not secret:
        return False

    try:
        expected = generate_identity_hash(payload, secret)
        # Constant-time comparison to prevent timing attacks
        return hmac_lib.compare_digest(expected.lower(), signature.lower())
    except Exception:
        return False
