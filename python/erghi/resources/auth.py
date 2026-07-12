"""Authentication resource"""

from typing import TYPE_CHECKING

from ..types import AuthResponse, LoginRequest, RegisterRequest, User

if TYPE_CHECKING:
    from ..client import ErghiClient


class AuthResource:
    """Authentication resource"""

    def __init__(self, client: "ErghiClient") -> None:
        self.client = client

    async def register(self, data: RegisterRequest) -> AuthResponse:
        """Register a new user"""
        response = await self.client.request(
            "POST",
            "/api/auth/register",
            json=data.model_dump(by_alias=True, exclude_none=True),
        )

        auth_response = AuthResponse.model_validate(response.json())
        self.client.set_access_token(auth_response.access_token)

        return auth_response

    async def login(self, data: LoginRequest) -> AuthResponse:
        """Login with email and password"""
        response = await self.client.request(
            "POST",
            "/api/auth/login",
            json=data.model_dump(by_alias=True, exclude_none=True),
        )

        auth_response = AuthResponse.model_validate(response.json())
        self.client.set_access_token(auth_response.access_token)

        return auth_response

    async def refresh(self, refresh_token: str) -> AuthResponse:
        """Refresh access token"""
        response = await self.client.request(
            "POST",
            "/api/auth/refresh",
            json={"refreshToken": refresh_token},
        )

        auth_response = AuthResponse.model_validate(response.json())
        self.client.set_access_token(auth_response.access_token)

        return auth_response

    async def logout(self) -> None:
        """Logout (revoke refresh token)"""
        await self.client.request("POST", "/api/auth/logout")
        self.client.set_access_token("")

    async def me(self) -> User:
        """Get current authenticated user"""
        response = await self.client.request("GET", "/api/auth/me")
        return User.model_validate(response.json())

    async def verify_email(self, token: str) -> None:
        """Verify email with token"""
        await self.client.request(
            "POST",
            "/api/auth/verify-email",
            json={"token": token},
        )

    async def forgot_password(self, email: str) -> None:
        """Request password reset"""
        await self.client.request(
            "POST",
            "/api/auth/forgot-password",
            json={"email": email},
        )

    async def reset_password(self, token: str, new_password: str) -> None:
        """Reset password with token"""
        await self.client.request(
            "POST",
            "/api/auth/reset-password",
            json={"token": token, "newPassword": new_password},
        )
