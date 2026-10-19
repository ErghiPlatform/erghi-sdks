"""Authentication resource (email/password users, backed by GoTrue).

The gateway forwards ``/api/auth/*`` to the platform's GoTrue auth server
unchanged, so requests and responses use GoTrue's snake_case shapes; they are
mapped onto the SDK's models here. Server-to-server integrations should use API
keys (``client_id``/``client_secret``) instead.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from ..errors import AuthenticationError
from ..types import AuthResponse, LoginRequest, RegisterRequest, User

if TYPE_CHECKING:
    from ..client import ErghiClient


class AuthResource:
    """Authentication resource"""

    def __init__(self, client: ErghiClient) -> None:
        self.client = client

    async def register(self, data: RegisterRequest) -> AuthResponse:
        """Register a new user.

        Tokens are empty while the platform waits for email confirmation
        (see :meth:`verify_email`).
        """
        response = await self.client.request(
            "POST",
            "/api/auth/register",
            json={
                "email": data.email,
                "password": data.password,
                "data": {"first_name": data.first_name, "last_name": data.last_name},
            },
        )
        return self._store(AuthResponse.from_gotrue(response.json()))

    async def login(self, data: LoginRequest) -> AuthResponse:
        """Login with email and password"""
        response = await self.client.request(
            "POST",
            "/api/auth/login",
            json={"email": data.email, "password": data.password},
        )
        return self._store(AuthResponse.from_gotrue(response.json()))

    async def refresh(self, refresh_token: str) -> AuthResponse:
        """Exchange a refresh token for a new session"""
        response = await self.client.request(
            "POST",
            "/api/auth/token",
            params={"grant_type": "refresh_token"},
            json={"refresh_token": refresh_token},
        )
        return self._store(AuthResponse.from_gotrue(response.json()))

    async def logout(self) -> None:
        """Logout (revoke refresh token)"""
        await self.client.request("POST", "/api/auth/logout")
        self.client.set_access_token("")

    async def me(self) -> User:
        """Get current authenticated user"""
        response = await self.client.request("GET", "/api/auth/user")
        return User.from_gotrue(response.json())

    async def verify_email(self, token: str) -> None:
        """Confirm a signup with the token from the confirmation email link"""
        response = await self.client.request(
            "POST",
            "/api/auth/verify",
            json={"type": "signup", "token_hash": token},
        )
        self._store(AuthResponse.from_gotrue(response.json()))

    async def forgot_password(self, email: str) -> None:
        """Send a password reset email"""
        await self.client.request("POST", "/api/auth/recover", json={"email": email})

    async def reset_password(self, token: str, new_password: str) -> None:
        """Set a new password using the token from the reset email link.

        The token is exchanged for a recovery session, which then updates the
        password.
        """
        verified = await self.client.request(
            "POST",
            "/api/auth/verify",
            json={"type": "recovery", "token_hash": token},
        )
        recovery_token = verified.json().get("access_token")
        if not recovery_token:
            raise AuthenticationError("Password reset token was not accepted")
        await self.client.request(
            "PUT",
            "/api/auth/user",
            json={"password": new_password},
            headers={"Authorization": f"Bearer {recovery_token}"},
        )

    def _store(self, auth: AuthResponse) -> AuthResponse:
        if auth.access_token:
            self.client.set_access_token(auth.access_token)
        return auth
