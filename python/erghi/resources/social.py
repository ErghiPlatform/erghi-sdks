"""Social inbox resource: Facebook and Instagram connections, comments, DMs and the report"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Union
from urllib.parse import quote

from ..types import (
    SocialCommentPage,
    SocialComment,
    SocialConnection,
    SocialConnectionSettings,
    SocialDisconnectPreview,
    SocialIgnoreResult,
    SocialMessageDelivery,
    SocialPostPage,
    SocialPrivateReplyResult,
    SocialReplyPolicy,
    SocialReport,
)

if TYPE_CHECKING:
    from ..client import ErghiClient

DateLike = Union[str, datetime]


def _seg(value: str) -> str:
    return quote(str(value), safe="")


def _iso(value: DateLike) -> str:
    return value.isoformat() if isinstance(value, datetime) else value


def _set(body: Dict[str, Any], key: str, value: Any) -> None:
    if value is not None:
        body[key] = value


class SocialResource:
    """The Facebook and Instagram social inbox: connected accounts and their settings, comment
    moderation, DM reply windows and the social report.

    Workspace (admin / server-side) operations; the workspace comes from the credential. The
    social inbox ships dark: a workspace without it gets 403 ``social_inbox_unavailable``.

    * Connections and settings need ``configure_ai``.
    * Reading posts and comments needs ``view_conversations`` or an API key with ``moderate_social``.
    * Hide, reply, private reply, done and ignore need ``moderate_social``.
    * The report needs ``view_insights``.

    Connecting an account is a browser-only Meta login and is not wrapped: connect in the admin
    portal. The server's error code (``private_reply_used``, ``private_reply_expired``,
    ``needs_reauth``, ``connection_unavailable``, ``meta_error``, ``use_comment_reply``...) is in
    ``error.details["code"]`` for 403/409/502 errors.

    Replying to a comment conversation through the ordinary conversation send call is refused
    with 409 ``use_comment_reply``; use :meth:`reply_to_comment` or :meth:`private_reply_to_comment`.
    """

    def __init__(self, client: ErghiClient) -> None:
        self.client = client

    # -- Connections (configure_ai) -------------------------------------------------

    async def list_connections(self) -> List[SocialConnection]:
        """Active Facebook Pages and Instagram accounts of the workspace."""
        response = await self.client.request("GET", "/api/v1/channels/meta/connections")
        return [SocialConnection.model_validate(x) for x in response.json()]

    async def get_connection_settings(self, connection_id: str) -> SocialConnectionSettings:
        response = await self.client.request(
            "GET", f"/api/v1/channels/meta/connections/{_seg(connection_id)}/settings"
        )
        return SocialConnectionSettings.model_validate(response.json())

    async def update_connection_settings(
        self,
        connection_id: str,
        *,
        auto_hide_spam: Optional[bool] = None,
        auto_hide_scam_impersonation: Optional[bool] = None,
        auto_hide_abuse: Optional[bool] = None,
        comment_reply_mode: Optional[str] = None,
        auto_public_replies_enabled: Optional[bool] = None,
        public_acknowledgment_enabled: Optional[bool] = None,
        reply_to_praise: Optional[bool] = None,
        max_auto_public_replies_per_post_per_hour: Optional[int] = None,
        allowed_link_domains: Optional[List[str]] = None,
        dms_enabled: Optional[bool] = None,
        comments_enabled: Optional[bool] = None,
    ) -> SocialConnectionSettings:
        """A partial update: only the arguments you pass are sent.

        ``comment_reply_mode`` is ``off``, ``suggest`` or ``auto``. ``allowed_link_domains``
        replaces the list (full domains such as ``help.example.com``, at most 20). Turning
        ``dms_enabled`` / ``comments_enabled`` on is refused (400
        ``capability_requires_reconnect``); reconnect the account instead.
        """
        body: Dict[str, Any] = {}
        _set(body, "autoHideSpam", auto_hide_spam)
        _set(body, "autoHideScamImpersonation", auto_hide_scam_impersonation)
        _set(body, "autoHideAbuse", auto_hide_abuse)
        _set(body, "commentReplyMode", comment_reply_mode)
        _set(body, "autoPublicRepliesEnabled", auto_public_replies_enabled)
        _set(body, "publicAcknowledgmentEnabled", public_acknowledgment_enabled)
        _set(body, "replyToPraise", reply_to_praise)
        _set(body, "maxAutoPublicRepliesPerPostPerHour", max_auto_public_replies_per_post_per_hour)
        _set(body, "allowedLinkDomains", allowed_link_domains)
        _set(body, "dmsEnabled", dms_enabled)
        _set(body, "commentsEnabled", comments_enabled)
        response = await self.client.request(
            "PUT", f"/api/v1/channels/meta/connections/{_seg(connection_id)}/settings", json=body
        )
        return SocialConnectionSettings.model_validate(response.json())

    async def get_disconnect_preview(self, connection_id: str) -> SocialDisconnectPreview:
        """What disconnecting would affect. Call it before :meth:`disconnect_connection`."""
        response = await self.client.request(
            "GET", f"/api/v1/channels/meta/connections/{_seg(connection_id)}/disconnect-preview"
        )
        return SocialDisconnectPreview.model_validate(response.json())

    async def disconnect_connection(self, connection_id: str) -> None:
        """Disconnects the account and deletes its stored access token. Reconnecting needs the browser Meta login."""
        await self.client.request(
            "DELETE", f"/api/v1/channels/meta/connections/{_seg(connection_id)}"
        )

    # -- Direct messages ----------------------------------------------------------------

    async def get_reply_policy(self, conversation_id: str) -> SocialReplyPolicy:
        """The DM reply window of a Messenger or Instagram conversation (needs ``view_conversations``, a member token)."""
        response = await self.client.request(
            "GET", f"/api/v1/channels/meta/conversations/{_seg(conversation_id)}/reply-policy"
        )
        return SocialReplyPolicy.model_validate(response.json())

    async def list_deliveries(self, conversation_id: str) -> List[SocialMessageDelivery]:
        """Delivery state of the outbound messages of a Messenger or Instagram conversation (member token)."""
        response = await self.client.request(
            "GET", f"/api/v1/channels/meta/conversations/{_seg(conversation_id)}/deliveries"
        )
        return [SocialMessageDelivery.model_validate(x) for x in response.json()]

    # -- Posts and comments ----------------------------------------------------------------

    async def list_posts(
        self,
        *,
        connection_id: Optional[str] = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
    ) -> SocialPostPage:
        """Posts that have comments you may see, newest comment first. ``page_size`` is capped at 100."""
        params: Dict[str, Any] = {}
        _set(params, "connectionId", connection_id)
        _set(params, "page", page)
        _set(params, "pageSize", page_size)
        response = await self.client.request("GET", "/api/v1/social/posts", params=params)
        return SocialPostPage.model_validate(response.json())

    async def list_comments(
        self,
        *,
        connection_id: Optional[str] = None,
        post_id: Optional[str] = None,
        category: Optional[str] = None,
        hidden: Optional[bool] = None,
        needs_attention: Optional[bool] = None,
        unanswered: Optional[bool] = None,
        page: Optional[int] = None,
        page_size: Optional[int] = None,
    ) -> SocialCommentPage:
        """Comments, newest first. ``category`` is ``question``, ``complaint``, ``praise``,
        ``spam``, ``scam_impersonation``, ``abuse`` or ``other`` (400 ``invalid_category`` otherwise)."""
        params: Dict[str, Any] = {}
        _set(params, "connectionId", connection_id)
        _set(params, "postId", post_id)
        _set(params, "category", category)
        _set(params, "hidden", hidden)
        _set(params, "needsAttention", needs_attention)
        _set(params, "unanswered", unanswered)
        _set(params, "page", page)
        _set(params, "pageSize", page_size)
        response = await self.client.request("GET", "/api/v1/social/comments", params=params)
        return SocialCommentPage.model_validate(response.json())

    async def hide_comment(self, comment_id: str) -> SocialComment:
        """Needs ``moderate_social``. Hides the comment on Meta (reversible; it is never deleted)."""
        response = await self.client.request(
            "POST", f"/api/v1/social/comments/{_seg(comment_id)}/hide"
        )
        return SocialComment.model_validate(response.json())

    async def unhide_comment(self, comment_id: str) -> SocialComment:
        """Needs ``moderate_social``."""
        response = await self.client.request(
            "POST", f"/api/v1/social/comments/{_seg(comment_id)}/unhide"
        )
        return SocialComment.model_validate(response.json())

    async def reply_to_comment(self, comment_id: str, text: str) -> SocialComment:
        """Needs ``moderate_social``. Posts a public reply. 409 ``cannot_reply`` / ``needs_reauth`` / ``connection_unavailable``."""
        response = await self.client.request(
            "POST", f"/api/v1/social/comments/{_seg(comment_id)}/reply", json={"text": text}
        )
        return SocialComment.model_validate(response.json())

    async def private_reply_to_comment(
        self, comment_id: str, text: str
    ) -> SocialPrivateReplyResult:
        """Needs ``moderate_social``. Sends the commenter a DM and opens the DM conversation.

        Meta allows one per comment within 7 days: 409 ``private_reply_used`` / ``private_reply_expired``.
        """
        response = await self.client.request(
            "POST",
            f"/api/v1/social/comments/{_seg(comment_id)}/private-reply",
            json={"text": text},
        )
        return SocialPrivateReplyResult.model_validate(response.json())

    async def mark_comment_done(self, comment_id: str) -> SocialComment:
        """Needs ``moderate_social``. Marks the comment handled (closes its conversation when nothing else is open)."""
        response = await self.client.request(
            "POST", f"/api/v1/social/comments/{_seg(comment_id)}/done"
        )
        return SocialComment.model_validate(response.json())

    async def ignore_comment_contact(self, comment_id: str) -> SocialIgnoreResult:
        """Needs ``moderate_social``. Blocks the commenter inside Erghi only; Meta's block API is never called."""
        response = await self.client.request(
            "POST", f"/api/v1/social/comments/{_seg(comment_id)}/ignore-contact"
        )
        return SocialIgnoreResult.model_validate(response.json())

    # -- Report (view_insights) ----------------------------------------------------------------

    @staticmethod
    def _report_params(
        from_: Optional[DateLike], to: Optional[DateLike], time_zone: Optional[str]
    ) -> Dict[str, str]:
        params: Dict[str, str] = {}
        if from_ is not None:
            params["from"] = _iso(from_)
        if to is not None:
            params["to"] = _iso(to)
        if time_zone:
            params["timeZone"] = time_zone
        return params

    async def get_report(
        self,
        *,
        from_: Optional[DateLike] = None,
        to: Optional[DateLike] = None,
        time_zone: Optional[str] = None,
    ) -> SocialReport:
        """Comment volume, moderation, response times and DM volume. The default range is 30 days."""
        response = await self.client.request(
            "GET", "/api/v1/reports/social", params=self._report_params(from_, to, time_zone)
        )
        return SocialReport.model_validate(response.json())

    async def export_report_csv(
        self,
        *,
        from_: Optional[DateLike] = None,
        to: Optional[DateLike] = None,
        time_zone: Optional[str] = None,
    ) -> str:
        """The report as CSV text (UTF-8 with a byte-order mark kept in the string)."""
        response = await self.client.request(
            "GET",
            "/api/v1/reports/social/export.csv",
            params=self._report_params(from_, to, time_zone),
        )
        return response.text
