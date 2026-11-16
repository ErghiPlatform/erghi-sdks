"""Contacts resource (requires platform PR #256)"""

from __future__ import annotations

import builtins
from typing import TYPE_CHECKING, Any
from urllib.parse import quote

from ..types import (
    ContactDetail,
    ContactEraseResult,
    ContactNote,
    ContactPage,
)

if TYPE_CHECKING:
    from ..client import ErghiClient


def _seg(value: str) -> str:
    return quote(str(value), safe="")


class ContactsResource:
    """The people who have chatted with the workspace. Requires platform PR #256.

    Workspace (admin / server-side) operations: the workspace comes from the API key or access
    token. Reading needs ``view_conversations``; update, block, unblock and erase need
    ``manage_contacts``. An API key can read contact notes but cannot author them.
    """

    def __init__(self, client: ErghiClient) -> None:
        self.client = client

    async def list(
        self,
        *,
        search: str | None = None,
        blocked: bool | None = None,
        page: int | None = None,
        page_size: int | None = None,
    ) -> ContactPage:
        """Search matches name, email, phone or external id. ``page_size`` is capped at 100."""
        params: dict[str, Any] = {}
        if search:
            params["search"] = search
        if blocked is not None:
            params["blocked"] = "true" if blocked else "false"
        if page is not None:
            params["page"] = page
        if page_size is not None:
            params["pageSize"] = page_size
        response = await self.client.request("GET", "/api/v1/contacts", params=params)
        return ContactPage.model_validate(response.json())

    async def get(self, contact_id: str) -> ContactDetail:
        response = await self.client.request("GET", f"/api/v1/contacts/{_seg(contact_id)}")
        return ContactDetail.model_validate(response.json())

    async def update(
        self,
        contact_id: str,
        *,
        name: str | None = None,
        email: str | None = None,
        phone: str | None = None,
    ) -> ContactDetail:
        """Needs ``manage_contacts``. Omitted fields are unchanged; an empty string clears one."""
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if email is not None:
            body["email"] = email
        if phone is not None:
            body["phone"] = phone
        response = await self.client.request(
            "PATCH", f"/api/v1/contacts/{_seg(contact_id)}", json=body
        )
        return ContactDetail.model_validate(response.json())

    async def block(self, contact_id: str) -> None:
        """Needs ``manage_contacts``"""
        await self.client.request("POST", f"/api/v1/contacts/{_seg(contact_id)}/block")

    async def unblock(self, contact_id: str) -> None:
        """Needs ``manage_contacts``"""
        await self.client.request("POST", f"/api/v1/contacts/{_seg(contact_id)}/unblock")

    async def erase(self, contact_id: str) -> ContactEraseResult:
        """Needs ``manage_contacts``. IRREVERSIBLY deletes the contact and all of their
        conversations and messages (GDPR erasure); the server records it in the audit log."""
        response = await self.client.request("DELETE", f"/api/v1/contacts/{_seg(contact_id)}")
        return ContactEraseResult.model_validate(response.json())

    async def list_notes(self, contact_id: str) -> builtins.list[ContactNote]:
        response = await self.client.request("GET", f"/api/v1/contacts/{_seg(contact_id)}/notes")
        return [ContactNote.model_validate(x) for x in response.json()]

    async def create_note(self, contact_id: str, content: str) -> ContactNote:
        """Needs a member token (403 ``member_required`` for API keys)"""
        response = await self.client.request(
            "POST", f"/api/v1/contacts/{_seg(contact_id)}/notes", json={"content": content}
        )
        return ContactNote.model_validate(response.json())

    async def update_note(self, contact_id: str, note_id: str, content: str) -> ContactNote:
        """Only the author can edit (403 ``note_not_author``)"""
        response = await self.client.request(
            "PUT",
            f"/api/v1/contacts/{_seg(contact_id)}/notes/{_seg(note_id)}",
            json={"content": content},
        )
        return ContactNote.model_validate(response.json())

    async def delete_note(self, contact_id: str, note_id: str) -> None:
        """The author or someone with ``manage_contacts`` can delete"""
        await self.client.request(
            "DELETE", f"/api/v1/contacts/{_seg(contact_id)}/notes/{_seg(note_id)}"
        )
