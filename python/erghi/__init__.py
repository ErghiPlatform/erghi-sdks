"""Erghi Python SDK"""

from __future__ import annotations

from .client import ErghiClient
from .errors import (
    AuthenticationError,
    ErghiError,
    HubException,
    NetworkError,
    NotFoundError,
    RateLimitError,
    ValidationError,
)
from .hmac import generate_identity_hash, verify_webhook_signature
from .types import (
    AuthResponse,
    Conversation,
    LoginRequest,
    Message,
    RegisterRequest,
    User,
    Workspace,
)

__version__ = "1.0.0"
__all__ = [
    "AuthResponse",
    "AuthenticationError",
    "Conversation",
    "ErghiClient",
    "ErghiError",
    "HubException",
    "LoginRequest",
    "Message",
    "NetworkError",
    "NotFoundError",
    "RateLimitError",
    "RegisterRequest",
    "User",
    "ValidationError",
    "Workspace",
    "generate_identity_hash",
    "verify_webhook_signature",
]
