"""Erghi Python SDK"""

from .client import ErghiClient
from .errors import (
    ErghiError,
    AuthenticationError,
    ValidationError,
    RateLimitError,
    NetworkError,
    NotFoundError,
)
from .hmac import generate_identity_hash, verify_webhook_signature
from .types import (
    User,
    RegisterRequest,
    LoginRequest,
    AuthResponse,
    Message,
    Conversation,
    Workspace,
)

__version__ = "1.0.0"
__all__ = [
    "ErghiClient",
    "ErghiError",
    "AuthenticationError",
    "ValidationError",
    "RateLimitError",
    "NetworkError",
    "NotFoundError",
    "User",
    "RegisterRequest",
    "LoginRequest",
    "AuthResponse",
    "Message",
    "Conversation",
    "Workspace",
    "generate_identity_hash",
    "verify_webhook_signature",
]
