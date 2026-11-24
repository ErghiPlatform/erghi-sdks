"""Contacts resource (requires platform PR #256)"""

from __future__ import annotations

import builtins
from typing import TYPE_CHECKING, Any
from urllib.parse import quote

from ..types import (
    ContactDetail,
    ContactEraseResult,
    ContactMergeResult,
    ContactMergeSuggestion,
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

    Merging needs a signed-in teammate's token with ``manage_contacts`` who can see every
    conversation (a teammate limited to some inboxes gets 403 ``contact_out_of_scope``). API keys
    get 403: ``manage_contacts`` is never grantable to a key.
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

    async def list_merge_suggestions(self) -> builtins.list[ContactMergeSuggestion]:
        """Pairs of contacts that share a verified email or phone number (at most 100).

        Pairs that would put two identities on one channel, and dismissed pairs, are left out.
        """
        response = await self.client.request("GET", "/api/v1/contacts/merge-suggestions")
        return [ContactMergeSuggestion.model_validate(x) for x in response.json()]

    async def merge(self, target_contact_id: str, source_contact_id: str) -> ContactMergeResult:
        """IRREVERSIBLY merges ``source_contact_id`` into ``target_contact_id``.

        The source's conversations, notes and channel identities move to the target, the target
        keeps its own name, email and phone (filling only blanks from the source), and the source
        contact is deleted. 400 ``merge_same_contact``; 409 ``merge_conflicting_identities`` when
        both have an identity on the same channel. Sends the ``contact.merged`` webhook and writes
        the security audit log.
        """
        response = await self.client.request(
            "POST",
            f"/api/v1/contacts/{_seg(target_contact_id)}/merge",
            json={"sourceContactId": source_contact_id},
        )
        return ContactMergeResult.model_validate(response.json())

    async def dismiss_merge_suggestion(self, contact_a_id: str, contact_b_id: str) -> None:
        """Stops suggesting this pair. Order does not matter, and repeating it is harmless."""
        await self.client.request(
            "POST",
            "/api/v1/contacts/merge-dismissals",
            json={"contactAId": contact_a_id, "contactBId": contact_b_id},
        )
