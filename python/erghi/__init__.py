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
    InsightConversation,
    InsightCount,
    InsightPage,
    InsightSummary,
    LoginRequest,
    Message,
    RegisterRequest,
    User,
    Workspace,
)

__version__ = "2.0.0"
__all__ = [
    "AuthResponse",
    "AuthenticationError",
    "Conversation",
    "ErghiClient",
    "ErghiError",
    "HubException",
    "InsightConversation",
    "InsightCount",
    "InsightPage",
    "InsightSummary",
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
