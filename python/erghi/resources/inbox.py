"""Inbox resource: labels, private notes, saved replies, notifications"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from urllib.parse import quote

from ..types import (
    CannedResponse,
    CannedResponseList,
    Conversation,
    ConversationLabel,
    ConversationLabelList,
    ConversationNote,
    MentionableMember,
    UserNotification,
)

if TYPE_CHECKING:
    from ..client import ErghiClient


def _seg(value: str) -> str:
    return quote(str(value), safe="")


class InboxResource:
    """Workspace inbox working data (admin / server-side operations).

    The workspace comes from the API key or access token, never from a parameter. Reading needs
    ``view_conversations``; creating, editing and deleting labels and saved replies needs
    ``manage_inbox_settings``. Notes are written by workspace members.
    API keys cannot hold these permissions today (403).

    Methods marked "requires platform PR #256" need that platform release.
    """

    def __init__(self, client: ErghiClient) -> None:
        self.client = client

    # -- Labels -------------------------------------------------------------

    async def list_labels(self) -> ConversationLabelList:
        """The workspace's labels and the per-workspace limit"""
        response = await self.client.request("GET", "/api/v1/conversation-labels")
        return ConversationLabelList.model_validate(response.json())

    async def create_label(
        self, name: str, *, color: str | None = None, description: str | None = None
    ) -> ConversationLabel:
        """Needs ``manage_inbox_settings``. 409 ``label_name_taken`` / ``label_limit_reached``."""
        response = await self.client.request(
            "POST",
            "/api/v1/conversation-labels",
            json={"name": name, "color": color, "description": description},
        )
        return ConversationLabel.model_validate(response.json())

    async def update_label(
        self,
        label_id: str,
        name: str,
        *,
        color: str | None = None,
        description: str | None = None,
    ) -> ConversationLabel:
        """Needs ``manage_inbox_settings``"""
        response = await self.client.request(
            "PUT",
            f"/api/v1/conversation-labels/{_seg(label_id)}",
            json={"name": name, "color": color, "description": description},
        )
        return ConversationLabel.model_validate(response.json())

    async def delete_label(self, label_id: str) -> None:
        """Needs ``manage_inbox_settings``. Also removes the label from every conversation."""
        await self.client.request("DELETE", f"/api/v1/conversation-labels/{_seg(label_id)}")

    async def get_conversation_labels(self, conversation_id: str) -> list[ConversationLabel]:
        """The labels on one conversation"""
        response = await self.client.request(
            "GET", f"/api/v1/conversations/{_seg(conversation_id)}/labels"
        )
        return [ConversationLabel.model_validate(x) for x in response.json()]

    async def set_conversation_labels(
        self, conversation_id: str, label_ids: list[str]
    ) -> list[ConversationLabel]:
        """Replace the conversation's labels with exactly ``label_ids``"""
        response = await self.client.request(
            "PUT",
            f"/api/v1/conversations/{_seg(conversation_id)}/labels",
            json={"labelIds": label_ids},
        )
        return [ConversationLabel.model_validate(x) for x in response.json()]

    async def add_conversation_label(
        self, conversation_id: str, label_id: str
    ) -> list[ConversationLabel]:
        """Add one label (a no-op if already present); returns the conversation's labels"""
        response = await self.client.request(
            "POST", f"/api/v1/conversations/{_seg(conversation_id)}/labels/{_seg(label_id)}"
        )
        return [ConversationLabel.model_validate(x) for x in response.json()]

    async def remove_conversation_label(
        self, conversation_id: str, label_id: str
    ) -> list[ConversationLabel]:
        """Remove one label (a no-op if absent); returns the conversation's labels"""
        response = await self.client.request(
            "DELETE", f"/api/v1/conversations/{_seg(conversation_id)}/labels/{_seg(label_id)}"
        )
        return [ConversationLabel.model_validate(x) for x in response.json()]

    # -- Conversation notes ---------------------------------------------------

    async def list_notes(self, conversation_id: str) -> list[ConversationNote]:
        response = await self.client.request(
            "GET", f"/api/v1/conversations/{_seg(conversation_id)}/notes"
        )
        return [ConversationNote.model_validate(x) for x in response.json()]

    async def create_note(
        self,
        conversation_id: str,
        content: str,
        *,
        mentioned_user_ids: list[str] | None = None,
    ) -> ConversationNote:
        """Needs a member token (API keys get 403).

        ``mentioned_user_ids`` requires platform PR #256.
        """
        body: dict[str, Any] = {"content": content}
        if mentioned_user_ids:
            body["mentionedUserIds"] = mentioned_user_ids
        response = await self.client.request(
            "POST", f"/api/v1/conversations/{_seg(conversation_id)}/notes", json=body
        )
        return ConversationNote.model_validate(response.json())

    async def update_note(
        self,
        conversation_id: str,
        note_id: str,
        content: str,
        *,
        mentioned_user_ids: list[str] | None = None,
    ) -> ConversationNote:
        """Only the author can edit (403 ``note_not_author``)"""
        body: dict[str, Any] = {"content": content}
        if mentioned_user_ids:
            body["mentionedUserIds"] = mentioned_user_ids
        response = await self.client.request(
            "PUT",
            f"/api/v1/conversations/{_seg(conversation_id)}/notes/{_seg(note_id)}",
            json=body,
        )
        return ConversationNote.model_validate(response.json())

    async def delete_note(self, conversation_id: str, note_id: str) -> None:
        """The author or someone with ``manage_inbox_settings`` can delete"""
        await self.client.request(
            "DELETE", f"/api/v1/conversations/{_seg(conversation_id)}/notes/{_seg(note_id)}"
        )

    # -- Saved replies --------------------------------------------------------

    async def list_canned_responses(self, search: str | None = None) -> CannedResponseList:
        """Saved replies, optionally filtered by short code prefix or content text"""
        params = {"search": search} if search else {}
        response = await self.client.request("GET", "/api/v1/canned-responses", params=params)
        return CannedResponseList.model_validate(response.json())

    async def create_canned_response(self, short_code: str, content: str) -> CannedResponse:
        """Needs ``manage_inbox_settings``. 409 ``canned_response_short_code_taken``."""
        response = await self.client.request(
            "POST",
            "/api/v1/canned-responses",
            json={"shortCode": short_code, "content": content},
        )
        return CannedResponse.model_validate(response.json())

    async def update_canned_response(
        self, response_id: str, short_code: str, content: str
    ) -> CannedResponse:
        """Needs ``manage_inbox_settings``"""
        response = await self.client.request(
            "PUT",
            f"/api/v1/canned-responses/{_seg(response_id)}",
            json={"shortCode": short_code, "content": content},
        )
        return CannedResponse.model_validate(response.json())

    async def delete_canned_response(self, response_id: str) -> None:
        """Needs ``manage_inbox_settings``"""
        await self.client.request("DELETE", f"/api/v1/canned-responses/{_seg(response_id)}")

    # -- Assignment, notifications, mentions (require platform PR #256) --------

    async def unassign_conversation(self, conversation_id: str) -> Conversation:
        """Return the conversation to the queue. Requires platform PR #256.

        409 for a resolved or closed conversation.
        """
        response = await self.client.request(
            "POST", f"/api/conversations/{_seg(conversation_id)}/unassign"
        )
        return Conversation.model_validate(response.json())

    async def list_notifications(
        self, *, unread_only: bool = False, limit: int | None = None
    ) -> list[UserNotification]:
        """The signed-in teammate's notifications, newest first. Requires platform PR #256.

        Notifications belong to a member, so an API key gets an empty list.
        """
        params: dict[str, Any] = {}
        if unread_only:
            params["unreadOnly"] = "true"
        if limit is not None:
            params["limit"] = limit
        response = await self.client.request("GET", "/api/v1/notifications", params=params)
        return [UserNotification.model_validate(x) for x in response.json()]

    async def get_unread_notification_count(self) -> int:
        """Requires platform PR #256"""
        response = await self.client.request("GET", "/api/v1/notifications/unread-count")
        return int(response.json()["count"])

    async def mark_notification_read(self, notification_id: str) -> None:
        """Requires platform PR #256"""
        await self.client.request("POST", f"/api/v1/notifications/{_seg(notification_id)}/read")

    async def mark_all_notifications_read(self) -> None:
        """Requires platform PR #256"""
        await self.client.request("POST", "/api/v1/notifications/read-all")

    async def list_mentionable_members(self) -> list[MentionableMember]:
        """Teammates who can be @mentioned in a note. Requires platform PR #256."""
        response = await self.client.request("GET", "/api/v1/team/mentionable")
        return [MentionableMember.model_validate(x) for x in response.json()]
