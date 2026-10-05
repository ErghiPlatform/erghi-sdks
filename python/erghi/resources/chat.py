"""Chat resource"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from ..types import Conversation, Message, PaginatedResponse, PaginationParams

if TYPE_CHECKING:
    from ..client import ErghiClient


class ChatResource:
    """Chat resource"""

    def __init__(self, client: ErghiClient) -> None:
        self.client = client

    async def get_conversation(self, conversation_id: str) -> Conversation:
        """Get conversation by ID"""
        response = await self.client.request(
            "GET",
            f"/api/conversations/{conversation_id}",
        )
        return Conversation.model_validate(response.json())

    async def list_conversations(
        self,
        params: PaginationParams | None = None,
    ) -> PaginatedResponse:
        """List conversations"""
        query_params = params.model_dump(exclude_none=True) if params else {}

        response = await self.client.request(
            "GET",
            "/api/conversations",
            params=query_params,
        )
        return PaginatedResponse.model_validate(response.json())

    async def create_conversation(
        self,
        widget_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> Conversation:
        """Create a new conversation"""
        payload = {"widgetId": widget_id, "metadata": metadata}
        if getattr(self.client, "visitor_id", None):
            payload["visitorId"] = self.client.visitor_id

        response = await self.client.request(
            "POST",
            "/api/conversations",
            json=payload,
        )
        return Conversation.model_validate(response.json())

    async def close_conversation(self, conversation_id: str) -> None:
        """Close conversation"""
        await self.client.request(
            "POST",
            f"/api/conversations/{conversation_id}/close",
        )

    async def send_message(
        self,
        conversation_id: str,
        content: str,
        message_type: str = "text",
        attachments: list[Any] | None = None,
    ) -> Message:
        """Send a message"""
        if attachments:
            # Multipart form data
            files = []
            data = {
                "content": content,
                "type": message_type,
            }

            for attachment in attachments:
                files.append(("attachments", attachment))

            response = await self.client.request(
                "POST",
                f"/api/conversations/{conversation_id}/messages",
                data=data,
                files=files,
            )
        else:
            # JSON request
            response = await self.client.request(
                "POST",
                f"/api/conversations/{conversation_id}/messages",
                json={"content": content, "type": message_type},
            )

        return Message.model_validate(response.json())

    async def get_messages(
        self,
        conversation_id: str,
        params: PaginationParams | None = None,
    ) -> PaginatedResponse:
        """Get messages for a conversation"""
        query_params = params.model_dump(exclude_none=True) if params else {}

        response = await self.client.request(
            "GET",
            f"/api/conversations/{conversation_id}/messages",
            params=query_params,
        )
        return PaginatedResponse.model_validate(response.json())

    async def mark_as_read(self, conversation_id: str, message_id: str) -> None:
        """Mark message as read"""
        await self.client.request(
            "POST",
            f"/api/conversations/{conversation_id}/messages/{message_id}/read",
        )

    async def send_typing(self, conversation_id: str) -> None:
        """Send typing indicator"""
        await self.client.send("user.typing", {"conversationId": conversation_id})
