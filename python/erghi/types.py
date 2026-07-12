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


class RegisterRequest(BaseModel):
    """Register request"""

    email: EmailStr
    password: str
    first_name: Optional[str] = Field(None, alias="firstName")
    last_name: Optional[str] = Field(None, alias="lastName")


class LoginRequest(BaseModel):
    """Login request"""

    email: EmailStr
    password: str
    two_factor_code: Optional[str] = Field(None, alias="twoFactorCode")


class AuthResponse(BaseModel):
    """Authentication response"""

    access_token: str = Field(alias="accessToken")
    refresh_token: str = Field(alias="refreshToken")
    expires_in: int = Field(alias="expiresIn")
    token_type: str = Field(alias="tokenType")
    user: User

    class Config:
        populate_by_name = True


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
    """Workspace model"""

    id: str
    name: str
    slug: str
    owner_id: str = Field(alias="ownerId")
    plan: Literal["free", "starter", "growth", "enterprise"]
    role: str
    created_at: datetime = Field(alias="createdAt")

    class Config:
        populate_by_name = True


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
