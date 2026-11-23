"""Workforce resource: agent status, routing, offers, settings and reports"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Union
from urllib.parse import quote

from ..types import (
    AgentProfile,
    AgentStatus,
    AwayReason,
    ChatOfferSummary,
    RoutingDecision,
    RoutingSkill,
    WorkforceSettings,
)

if TYPE_CHECKING:
    from ..client import ErghiClient

DateLike = Union[str, datetime]


def _seg(value: str) -> str:
    return quote(str(value), safe="")


def _iso(value: DateLike) -> str:
    return value.isoformat() if isinstance(value, datetime) else value


def _report_params(
    from_: Optional[DateLike],
    to: Optional[DateLike],
    time_zone: Optional[str],
    group_by: Optional[str],
    agent_id: Optional[str] = None,
) -> Dict[str, str]:
    params: Dict[str, str] = {}
    if agent_id is not None:
        params["agentId"] = agent_id
    if from_ is not None:
        params["from"] = _iso(from_)
    if to is not None:
        params["to"] = _iso(to)
    if time_zone:
        params["timeZone"] = time_zone
    if group_by:
        params["groupBy"] = group_by
    return params


def _set(body: Dict[str, Any], key: str, value: Any) -> None:
    """Add ``key`` only when the caller passed a value: ``None`` always means "leave it"."""
    if value is not None:
        body[key] = value


class WorkforceResource:
    """Agent status, the live board, away reasons, routing skills and profiles, workforce settings,
    chat offers, "why me" routing decisions and the status/performance reports.

    Workspace (admin / server-side) operations; the workspace comes from the credential, never
    from a parameter.

    * ``manage_workforce`` (an API key can hold it): force a status, sign an agent out, write
      away reasons, skills, profiles and settings; it can also read :meth:`get_live`,
      :meth:`list_away_reasons`, :meth:`list_skills` and :meth:`get_settings`.
    * ``view_conversations`` (a signed-in teammate; an API key can never hold it): own status,
      own offers, accept and decline. Methods marked "member token" answer 403 for an API key.
    * ``view_insights``: the reports and the supervisor view of :meth:`get_routing_decision`.
      Plan gated: 403 ``plan_required`` when the plan has no workforce analytics.

    The server's error code (for example ``offer_taken``, ``reason_name_taken``, ``skill_limit``)
    is in ``error.details["code"]`` for 403/409 errors.
    """

    def __init__(self, client: ErghiClient) -> None:
        self.client = client

    # -- Status -------------------------------------------------------------

    async def get_my_status(self) -> AgentStatus:
        """Member token. The signed-in teammate's own status."""
        response = await self.client.request("GET", "/api/v1/workforce/me/status")
        return AgentStatus.model_validate(response.json())

    async def set_my_status(
        self,
        state: str,
        *,
        reason_id: Optional[str] = None,
        note: Optional[str] = None,
        return_chats: Optional[bool] = None,
    ) -> AgentStatus:
        """Member token. ``state`` is ``ready``, ``away`` or ``offline``.

        ``reason_id`` is required when the workspace's ``require_away_reason`` is on and the
        state is ``away``. ``return_chats=True`` sends the agent's assigned chats back to the queue.
        """
        body: Dict[str, Any] = {"state": state}
        _set(body, "reasonId", reason_id)
        _set(body, "note", note)
        _set(body, "returnChats", return_chats)
        response = await self.client.request("PUT", "/api/v1/workforce/me/status", json=body)
        return AgentStatus.model_validate(response.json())

    async def set_agent_status(
        self,
        agent_id: str,
        state: str,
        *,
        reason_id: Optional[str] = None,
        note: Optional[str] = None,
        return_chats: Optional[bool] = None,
    ) -> AgentStatus:
        """Needs ``manage_workforce``. Forces an agent's status (audited as ``workforce.status_forced``)."""
        body: Dict[str, Any] = {"state": state}
        _set(body, "reasonId", reason_id)
        _set(body, "note", note)
        _set(body, "returnChats", return_chats)
        response = await self.client.request(
            "PUT", f"/api/v1/workforce/agents/{_seg(agent_id)}/status", json=body
        )
        return AgentStatus.model_validate(response.json())

    async def sign_out_agent(self, agent_id: str) -> AgentStatus:
        """Needs ``manage_workforce``. Sets the agent Offline now and returns their chats to the queue."""
        response = await self.client.request(
            "POST", f"/api/v1/workforce/agents/{_seg(agent_id)}/sign-out"
        )
        return AgentStatus.model_validate(response.json())

    async def get_live(self) -> Dict[str, Any]:
        """Live agents, their state and load, and the queue.

        Needs ``view_conversations`` or ``manage_workforce``. Without ``view_insights`` (or
        without plan analytics) only the caller is listed. The server builds this object ad hoc
        and it grows, so it is returned as a plain dict (``queue`` and ``agents``).
        """
        response = await self.client.request("GET", "/api/v1/workforce/live")
        return dict(response.json())

    # -- Away reasons ---------------------------------------------------------

    async def list_away_reasons(self, *, include_archived: bool = False) -> List[AwayReason]:
        """``include_archived`` is honoured only for a caller with ``manage_workforce``."""
        params = {"includeArchived": True} if include_archived else {}
        response = await self.client.request("GET", "/api/v1/workforce/away-reasons", params=params)
        return [AwayReason.model_validate(x) for x in response.json()]

    async def create_away_reason(
        self,
        name: str,
        *,
        color: Optional[str] = None,
        max_minutes: Optional[int] = None,
        reassign_chats: Optional[bool] = None,
        sort_order: Optional[int] = None,
    ) -> AwayReason:
        """Needs ``manage_workforce``. 409 ``reason_name_taken`` / ``reason_limit`` (30 active)."""
        body: Dict[str, Any] = {"name": name}
        _set(body, "color", color)
        _set(body, "maxMinutes", max_minutes)
        _set(body, "reassignChats", reassign_chats)
        _set(body, "sortOrder", sort_order)
        response = await self.client.request("POST", "/api/v1/workforce/away-reasons", json=body)
        return AwayReason.model_validate(response.json())

    async def update_away_reason(
        self,
        reason_id: str,
        *,
        name: Optional[str] = None,
        color: Optional[str] = None,
        max_minutes: Optional[int] = None,
        reassign_chats: Optional[bool] = None,
        sort_order: Optional[int] = None,
        archived: Optional[bool] = None,
    ) -> AwayReason:
        """Needs ``manage_workforce``. Only the fields you pass are sent.

        Pass ``reassign_chats`` on every update: the server reads an omitted value as ``False``.
        ``archived=False`` restores an archived reason, ``True`` archives it.
        """
        body: Dict[str, Any] = {}
        _set(body, "name", name)
        _set(body, "color", color)
        _set(body, "maxMinutes", max_minutes)
        _set(body, "reassignChats", reassign_chats)
        _set(body, "sortOrder", sort_order)
        _set(body, "archived", archived)
        response = await self.client.request(
            "PUT", f"/api/v1/workforce/away-reasons/{_seg(reason_id)}", json=body
        )
        return AwayReason.model_validate(response.json())

    async def archive_away_reason(self, reason_id: str) -> AwayReason:
        """Needs ``manage_workforce``. Archives (never deletes); 409 ``reason_protected`` for the default Away reason."""
        response = await self.client.request(
            "DELETE", f"/api/v1/workforce/away-reasons/{_seg(reason_id)}"
        )
        return AwayReason.model_validate(response.json())

    # -- Routing skills ---------------------------------------------------------

    async def list_skills(self, *, include_archived: bool = False) -> List[RoutingSkill]:
        """``include_archived`` is honoured only for a caller with ``manage_workforce``."""
        params = {"includeArchived": True} if include_archived else {}
        response = await self.client.request("GET", "/api/v1/workforce/skills", params=params)
        return [RoutingSkill.model_validate(x) for x in response.json()]

    async def create_skill(self, name: str, description: str) -> RoutingSkill:
        """Needs ``manage_workforce``. 409 ``skill_name_taken`` / ``skill_limit``."""
        response = await self.client.request(
            "POST", "/api/v1/workforce/skills", json={"name": name, "description": description}
        )
        return RoutingSkill.model_validate(response.json())

    async def update_skill(
        self,
        skill_id: str,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        archived: Optional[bool] = None,
    ) -> RoutingSkill:
        """Needs ``manage_workforce``. Only the fields you pass are sent; ``archived`` restores or archives."""
        body: Dict[str, Any] = {}
        _set(body, "name", name)
        _set(body, "description", description)
        _set(body, "archived", archived)
        response = await self.client.request(
            "PUT", f"/api/v1/workforce/skills/{_seg(skill_id)}", json=body
        )
        return RoutingSkill.model_validate(response.json())

    async def archive_skill(self, skill_id: str) -> RoutingSkill:
        """Needs ``manage_workforce``. Archives (never deletes) the skill."""
        response = await self.client.request("DELETE", f"/api/v1/workforce/skills/{_seg(skill_id)}")
        return RoutingSkill.model_validate(response.json())

    # -- Agent routing profile ----------------------------------------------------

    async def get_agent_profile(self, agent_id: str) -> AgentProfile:
        """Needs ``manage_workforce``. 404 for an id that is not a member of this workspace."""
        response = await self.client.request(
            "GET", f"/api/v1/workforce/agents/{_seg(agent_id)}/profile"
        )
        return AgentProfile.model_validate(response.json())

    async def save_agent_profile(
        self,
        agent_id: str,
        *,
        max_concurrent_chats: Optional[int] = None,
        languages: Optional[List[str]] = None,
        skills: Optional[List[Dict[str, Any]]] = None,
    ) -> AgentProfile:
        """Needs ``manage_workforce``. Send the whole profile: the server resets an omitted
        ``max_concurrent_chats`` to the workspace default and an omitted ``languages`` to empty.

        ``skills`` is a list of ``{"skillId": ..., "level": 1|2|3}`` (basic, skilled, expert);
        when given it replaces the agent's skills (an empty list clears them), when omitted
        the skills are left alone. 404 ``skill_not_found`` for an unknown skill id.
        """
        body: Dict[str, Any] = {}
        _set(body, "maxConcurrentChats", max_concurrent_chats)
        _set(body, "languages", languages)
        _set(body, "skills", skills)
        response = await self.client.request(
            "PUT", f"/api/v1/workforce/agents/{_seg(agent_id)}/profile", json=body
        )
        return AgentProfile.model_validate(response.json())

    # -- Settings --------------------------------------------------------------------

    async def get_settings(self) -> WorkforceSettings:
        """Needs ``view_conversations`` or ``manage_workforce``."""
        response = await self.client.request("GET", "/api/v1/workforce/settings")
        return WorkforceSettings.model_validate(response.json())

    async def update_settings(
        self,
        *,
        status_on_sign_in: Optional[str] = None,
        require_away_reason: Optional[bool] = None,
        idle_away_minutes: Optional[int] = None,
        sign_out_after_hours_minutes: Optional[int] = None,
        auto_away_after_missed_offers: Optional[int] = None,
        ai_routing_enabled: Optional[bool] = None,
        language_match: Optional[str] = None,
        skill_wait_seconds: Optional[int] = None,
        offer_mode: Optional[str] = None,
        offer_timeout_seconds: Optional[int] = None,
    ) -> WorkforceSettings:
        """Needs ``manage_workforce``. A partial update: only the arguments you pass are sent, so
        everything else keeps its stored value.

        ``0`` turns ``idle_away_minutes``, ``sign_out_after_hours_minutes`` or
        ``auto_away_after_missed_offers`` off (a read reports an off feature as ``None``).
        ``language_match`` is ``off``, ``preferred`` or ``required``; ``offer_mode`` is ``off``
        or ``ring``. 403 ``plan_required`` when turning AI routing on without plan support.
        """
        body: Dict[str, Any] = {}
        _set(body, "statusOnSignIn", status_on_sign_in)
        _set(body, "requireAwayReason", require_away_reason)
        _set(body, "idleAwayMinutes", idle_away_minutes)
        _set(body, "signOutAfterHoursMinutes", sign_out_after_hours_minutes)
        _set(body, "autoAwayAfterMissedOffers", auto_away_after_missed_offers)
        routing: Dict[str, Any] = {}
        _set(routing, "aiRoutingEnabled", ai_routing_enabled)
        _set(routing, "languageMatch", language_match)
        _set(routing, "skillWaitSeconds", skill_wait_seconds)
        _set(routing, "offerMode", offer_mode)
        _set(routing, "offerTimeoutSeconds", offer_timeout_seconds)
        if routing:
            body["routing"] = routing
        response = await self.client.request("PUT", "/api/v1/workforce/settings", json=body)
        return WorkforceSettings.model_validate(response.json())

    # -- Chat offers (offer_mode "ring"; member token) ---------------------------------

    async def list_my_offers(self) -> List[ChatOfferSummary]:
        """Member token. The caller's open offers, for a client that reconnected after the push."""
        response = await self.client.request("GET", "/api/v1/workforce/offers/mine")
        return [ChatOfferSummary.model_validate(x) for x in response.json()["items"]]

    async def accept_offer(self, offer_id: str) -> str:
        """Member token. Returns the assigned conversation id.

        404 ``offer_not_found``; 409 ``offer_expired`` / ``offer_taken`` / ``offer_closed``;
        403 ``access_revoked``.
        """
        response = await self.client.request(
            "POST", f"/api/v1/workforce/offers/{_seg(offer_id)}/accept"
        )
        return str(response.json()["conversationId"])

    async def decline_offer(self, offer_id: str) -> None:
        """Member token. 404 ``offer_not_found``; 409 ``offer_expired`` / ``offer_closed``."""
        await self.client.request("POST", f"/api/v1/workforce/offers/{_seg(offer_id)}/decline")

    # -- Why me ---------------------------------------------------------------------------

    async def get_routing_decision(self, conversation_id: str) -> RoutingDecision:
        """Why a chat went to its agent. Needs ``view_conversations`` (a member token): a supervisor
        (``view_insights``) sees every candidate and offer, the assignee only their own rows;
        anyone else gets 404."""
        response = await self.client.request(
            "GET", f"/api/v1/conversations/{_seg(conversation_id)}/routing-decision"
        )
        return RoutingDecision.model_validate(response.json())

    # -- Reports (view_insights, plan gated, range at most 92 days) -------------------------

    async def get_agent_status_report(
        self,
        *,
        from_: Optional[DateLike] = None,
        to: Optional[DateLike] = None,
        time_zone: Optional[str] = None,
        group_by: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Time per status and reason, per agent, team or day (a plain dict, as the server builds it)."""
        response = await self.client.request(
            "GET",
            "/api/v1/reports/agent-status",
            params=_report_params(from_, to, time_zone, group_by),
        )
        return dict(response.json())

    async def get_agent_status_timeline(
        self,
        agent_id: str,
        *,
        from_: Optional[DateLike] = None,
        to: Optional[DateLike] = None,
        time_zone: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Status intervals of one agent. The supervisor ``note`` is ``None`` for an API key."""
        response = await self.client.request(
            "GET",
            "/api/v1/reports/agent-status/timeline",
            params=_report_params(from_, to, time_zone, None, agent_id),
        )
        return dict(response.json())

    async def get_agent_performance_report(
        self,
        *,
        from_: Optional[DateLike] = None,
        to: Optional[DateLike] = None,
        time_zone: Optional[str] = None,
        group_by: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Workload, utilisation and offer metrics per agent, team or day."""
        response = await self.client.request(
            "GET",
            "/api/v1/reports/agent-performance",
            params=_report_params(from_, to, time_zone, group_by),
        )
        return dict(response.json())

    async def export_agent_status_csv(
        self,
        *,
        from_: Optional[DateLike] = None,
        to: Optional[DateLike] = None,
        time_zone: Optional[str] = None,
    ) -> str:
        """The status report as CSV text (UTF-8 with a byte-order mark kept in the string)."""
        response = await self.client.request(
            "GET",
            "/api/v1/reports/agent-status/export.csv",
            params=_report_params(from_, to, time_zone, None),
        )
        return response.text

    async def export_agent_performance_csv(
        self,
        *,
        from_: Optional[DateLike] = None,
        to: Optional[DateLike] = None,
        time_zone: Optional[str] = None,
        group_by: Optional[str] = None,
    ) -> str:
        """The performance report as CSV text."""
        response = await self.client.request(
            "GET",
            "/api/v1/reports/agent-performance/export.csv",
            params=_report_params(from_, to, time_zone, group_by),
        )
        return response.text
