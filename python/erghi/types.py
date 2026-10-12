"""Type definitions for Erghi SDK"""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field


class User(BaseModel):
    """User model"""

    id: str
    email: EmailStr
    first_name: Optional[str] = Field(None, alias="firstName")
    last_name: Optional[str] = Field(None, alias="lastName")
    avatar: Optional[str] = None
    role: str
    email_verified: bool = Field(alias="emailVerified")
    two_factor_enabled: bool = Field(alias="twoFactorEnabled")
    created_at: datetime = Field(alias="createdAt")
    last_login_at: Optional[datetime] = Field(None, alias="lastLoginAt")

    class Config:
        populate_by_name = True

    @classmethod
    def from_gotrue(cls, data: Dict[str, Any]) -> "User":
        """Build from the auth server's snake_case user object."""
        metadata: Dict[str, Any] = data.get("user_metadata") or {}

        def text(key: str) -> Optional[str]:
            value = metadata.get(key)
            return value if isinstance(value, str) else None

        return cls.model_validate(
            {
                "id": data["id"],
                "email": data.get("email") or "",
                "firstName": text("first_name"),
                "lastName": text("last_name"),
                "avatar": text("avatar_url"),
                "role": data.get("role") or "authenticated",
                "emailVerified": bool(data.get("email_confirmed_at")),
                "twoFactorEnabled": bool(data.get("factors")),
                "createdAt": data["created_at"],
                "lastLoginAt": data.get("last_sign_in_at"),
            }
        )


class RegisterRequest(BaseModel):
    """Register request"""

    email: EmailStr
    password: str
    first_name: Optional[str] = Field(None, alias="firstName")
    last_name: Optional[str] = Field(None, alias="lastName")

    class Config:
        populate_by_name = True


class LoginRequest(BaseModel):
    """Login request"""

    email: EmailStr
    password: str
    two_factor_code: Optional[str] = Field(None, alias="twoFactorCode")

    class Config:
        populate_by_name = True


class AuthResponse(BaseModel):
    """Authentication response.

    Tokens are empty strings when registration is pending email confirmation.
    """

    access_token: str = Field(alias="accessToken")
    refresh_token: str = Field(alias="refreshToken")
    expires_in: int = Field(alias="expiresIn")
    token_type: str = Field(alias="tokenType")
    user: User

    class Config:
        populate_by_name = True

    @classmethod
    def from_gotrue(cls, data: Dict[str, Any]) -> "AuthResponse":
        """Build from an auth server session (or a bare user from signup)."""
        user = data.get("user") or data
        return cls.model_validate(
            {
                "accessToken": data.get("access_token") or "",
                "refreshToken": data.get("refresh_token") or "",
                "expiresIn": data.get("expires_in") or 0,
                "tokenType": data.get("token_type") or "bearer",
                "user": User.from_gotrue(user),
            }
        )


class Attachment(BaseModel):
    """Message attachment"""

    id: str
    filename: str
    content_type: str = Field(alias="contentType")
    size: int
    url: str

    class Config:
        populate_by_name = True


class Message(BaseModel):
    """Chat message"""

    id: str
    conversation_id: str = Field(alias="conversationId")
    sender: Literal["visitor", "agent", "system", "ai"]
    sender_id: Optional[str] = Field(None, alias="senderId")
    type: Literal["text", "image", "file", "system"]
    content: str
    attachments: Optional[List[Attachment]] = None
    created_at: datetime = Field(alias="createdAt")
    read_at: Optional[datetime] = Field(None, alias="readAt")
    is_ai: bool = Field(alias="isAI")
    ai_model: Optional[str] = Field(None, alias="aiModel")
    # "voice" when the visitor sent it as a voice note (content is the transcript).
    source: Optional[str] = None

    class Config:
        populate_by_name = True


class Conversation(BaseModel):
    """Chat conversation"""

    id: str
    workspace_id: str = Field(alias="workspaceId")
    widget_id: str = Field(alias="widgetId")
    visitor_id: Optional[str] = Field(None, alias="visitorId")
    assigned_agent_id: Optional[str] = Field(None, alias="assignedAgentId")
    status: Literal["open", "assigned", "resolved", "closed"]
    channel: Literal["web_widget", "email", "sms", "whatsapp"]
    started_at: datetime = Field(alias="startedAt")
    closed_at: Optional[datetime] = Field(None, alias="closedAt")
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        populate_by_name = True


class Workspace(BaseModel):
    """Workspace of the signed-in user's account"""

    id: str = Field(alias="workspaceId")
    name: str
    slug: str = ""
    is_current: bool = Field(False, alias="isCurrent")

    class Config:
        populate_by_name = True

    @classmethod
    def from_summary(cls, data: Dict[str, Any]) -> "Workspace":
        """Build from a ``GET /api/v1/accounts/workspaces`` row."""
        return cls.model_validate(
            {
                "workspaceId": data["workspaceId"],
                "name": data["name"],
                "slug": data.get("slug") or "",
                "isCurrent": bool(data.get("isCurrent")),
            }
        )


class PaginationParams(BaseModel):
    """Pagination parameters"""

    page: Optional[int] = 1
    limit: Optional[int] = 50
    sort: Optional[str] = None
    order: Optional[Literal["asc", "desc"]] = "desc"


class PaginatedResponse(BaseModel):
    """Paginated response"""

    data: List[Any]
    total: int
    page: int
    limit: int
    total_pages: int = Field(alias="totalPages")

    class Config:
        populate_by_name = True
