"""Custom exceptions for Erghi SDK"""

from __future__ import annotations

from typing import Any


class ErghiError(Exception):
    """Base exception for Erghi SDK"""

    def __init__(
        self,
        message: str,
        code: str,
        status_code: int | None = None,
        details: Any | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details


class AuthenticationError(ErghiError):
    """Authentication failed"""

    def __init__(self, message: str = "Authentication failed", details: Any | None = None) -> None:
        super().__init__(message, "AUTH_ERROR", 401, details)


class ValidationError(ErghiError):
    """Validation failed"""

    def __init__(
        self,
        message: str = "Validation failed",
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message, "VALIDATION_ERROR", 400, details)


class RateLimitError(ErghiError):
    """Rate limit exceeded"""

    def __init__(self, message: str = "Rate limit exceeded", retry_after: int = 60) -> None:
        super().__init__(message, "RATE_LIMIT_ERROR", 429)
        self.retry_after = retry_after


class NetworkError(ErghiError):
    """Network request failed"""

    def __init__(self, message: str = "Network request failed", details: Any | None = None) -> None:
        super().__init__(message, "NETWORK_ERROR", None, details)


class NotFoundError(ErghiError):
    """Resource not found"""

    def __init__(self, message: str = "Resource not found") -> None:
        super().__init__(message, "NOT_FOUND", 404)


class HubException(ErghiError):
    """The real-time hub rejected an invocation (a SignalR Completion message with an
    error) -- for example ConversationOwnershipHubFilter denying JoinConversation/
    SendMessage/etc. for a conversation outside the caller's own workspace."""

    def __init__(self, message: str) -> None:
        super().__init__(message, "HUB_EXCEPTION")


class ApiError(ErghiError):
    """The platform refused a call with a machine-readable code, for example 409 ``turn_closed``,
    ``turn_superseded``, ``human_engaged``, ``handoff_unavailable`` or 403 ``configure_ai_required``.

    ``code`` stays ``"API_ERROR"`` (as before); the platform's code is ``error_code`` and the close
    reason, when it gives one, is ``reason``.
    """

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        details: Any | None = None,
        error_code: str | None = None,
        reason: str | None = None,
    ) -> None:
        super().__init__(message, "API_ERROR", status_code, details)
        self.error_code = error_code
        self.reason = reason
