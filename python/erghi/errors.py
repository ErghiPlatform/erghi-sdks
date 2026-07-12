"""Custom exceptions for Erghi SDK"""

from typing import Any, Dict, Optional


class ErghiError(Exception):
    """Base exception for Erghi SDK"""

    def __init__(
        self,
        message: str,
        code: str,
        status_code: Optional[int] = None,
        details: Optional[Any] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details


class AuthenticationError(ErghiError):
    """Authentication failed"""

    def __init__(
        self, message: str = "Authentication failed", details: Optional[Any] = None
    ) -> None:
        super().__init__(message, "AUTH_ERROR", 401, details)


class ValidationError(ErghiError):
    """Validation failed"""

    def __init__(
        self,
        message: str = "Validation failed",
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message, "VALIDATION_ERROR", 400, details)


class RateLimitError(ErghiError):
    """Rate limit exceeded"""

    def __init__(self, message: str = "Rate limit exceeded", retry_after: int = 60) -> None:
        super().__init__(message, "RATE_LIMIT_ERROR", 429)
        self.retry_after = retry_after


class NetworkError(ErghiError):
    """Network request failed"""

    def __init__(
        self, message: str = "Network request failed", details: Optional[Any] = None
    ) -> None:
        super().__init__(message, "NETWORK_ERROR", None, details)


class NotFoundError(ErghiError):
    """Resource not found"""

    def __init__(self, message: str = "Resource not found") -> None:
        super().__init__(message, "NOT_FOUND", 404)
