import { ErghiClient } from '../client';
import {
  AgentProfile,
  AgentStatus,
  AwayReason,
  ChatOfferSummary,
  RoutingDecision,
  RoutingSkill,
  SaveAgentProfileRequest,
  SaveAwayReasonRequest,
  SaveRoutingSkillRequest,
  SetAgentStatusRequest,
  UpdateWorkforceSettingsRequest,
  WorkforceLive,
  WorkforceReport,
  WorkforceReportQuery,
  WorkforceSettings,
} from '../types';

const seg = (id: string) => encodeURIComponent(id);

const iso = (v: string | Date) => (v instanceof Date ? v.toISOString() : v);

function reportParams(query: WorkforceReportQuery = {}, agentId?: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (agentId !== undefined) params.agentId = agentId;
  if (query.from !== undefined) params.from = iso(query.from);
  if (query.to !== undefined) params.to = iso(query.to);
  if (query.timeZone) params.timeZone = query.timeZone;
  if (query.groupBy) params.groupBy = query.groupBy;
  return params;
}

/**
 * Workforce: agent status, the live board, away reasons, routing skills and profiles, workforce
 * settings, chat offers, "why me" routing decisions and the status/performance reports.
 *
 * Workspace (admin / server-side) operations. The workspace comes from the credential, never from
 * a parameter. Permissions:
 * - `manage_workforce` (an API key can hold it): force a status, sign an agent out, write away
 *   reasons, skills, profiles and settings. It can also read `getLive`, `listAwayReasons`,
 *   `listSkills` and `getSettings`.
 * - `view_conversations` (a signed-in teammate; an API key can never hold it): own status, own
 *   offers, accept/decline. Methods marked "member token" fail with 403 for an API key.
 * - `view_insights`: the reports and the supervisor view of `getRoutingDecision`. Plan gated: 403
 *   `plan_required` when the plan has no workforce analytics.
 *
 * Errors carry the server's code in `error.details.code` (for example `offer_taken`,
 * `reason_name_taken`, `skill_limit`).
 */
export class WorkforceResource {
  constructor(private client: ErghiClient) {}

  private get http() {
    return this.client.getHttpClient();
  }

  // -- Status -----------------------------------------------------------------

  /** Member token. The signed-in teammate's own status. */
  async getMyStatus(): Promise<AgentStatus> {
    return (await this.http.get<AgentStatus>('/api/v1/workforce/me/status')).data;
  }

  /** Member token. 400 `validation_failed`-style errors when an away reason is required but missing. */
  async setMyStatus(request: SetAgentStatusRequest): Promise<AgentStatus> {
    return (await this.http.put<AgentStatus>('/api/v1/workforce/me/status', request)).data;
  }

  /** Needs `manage_workforce`. Forces an agent's status (audited as `workforce.status_forced`). */
  async setAgentStatus(agentId: string, request: SetAgentStatusRequest): Promise<AgentStatus> {
    return (await this.http.put<AgentStatus>(`/api/v1/workforce/agents/${seg(agentId)}/status`, request)).data;
  }

  /** Needs `manage_workforce`. Sets the agent Offline now and returns their chats to the queue. */
  async signOutAgent(agentId: string): Promise<AgentStatus> {
    return (await this.http.post<AgentStatus>(`/api/v1/workforce/agents/${seg(agentId)}/sign-out`)).data;
  }

  /**
   * Live agents, their state and load, and the queue. Needs `view_conversations` or
   * `manage_workforce`. Without `view_insights` (or without plan analytics) only the caller is listed.
   */
  async getLive(): Promise<WorkforceLive> {
    return (await this.http.get<WorkforceLive>('/api/v1/workforce/live')).data;
  }

  // -- Away reasons -------------------------------------------------------------

  /** `includeArchived` is honoured only for a caller with `manage_workforce`. */
  async listAwayReasons(includeArchived = false): Promise<AwayReason[]> {
    const params = includeArchived ? { includeArchived: true } : {};
    return (await this.http.get<AwayReason[]>('/api/v1/workforce/away-reasons', { params })).data;
  }

  /** Needs `manage_workforce`. 409 `reason_name_taken` / `reason_limit` (30 active). */
  async createAwayReason(request: SaveAwayReasonRequest): Promise<AwayReason> {
    return (await this.http.post<AwayReason>('/api/v1/workforce/away-reasons', request)).data;
  }

  /** Needs `manage_workforce`. Send `reassignChats` every time; an omitted value is read as `false`. */
  async updateAwayReason(id: string, request: SaveAwayReasonRequest): Promise<AwayReason> {
    return (await this.http.put<AwayReason>(`/api/v1/workforce/away-reasons/${seg(id)}`, request)).data;
  }

  /** Needs `manage_workforce`. Archives (never deletes) the reason; 409 `reason_protected` for the default Away reason. */
  async archiveAwayReason(id: string): Promise<AwayReason> {
    return (await this.http.delete<AwayReason>(`/api/v1/workforce/away-reasons/${seg(id)}`)).data;
  }

  // -- Routing skills ---------------------------------------------------------------

  /** `includeArchived` is honoured only for a caller with `manage_workforce`. */
  async listSkills(includeArchived = false): Promise<RoutingSkill[]> {
    const params = includeArchived ? { includeArchived: true } : {};
    return (await this.http.get<RoutingSkill[]>('/api/v1/workforce/skills', { params })).data;
  }

  /** Needs `manage_workforce`. Name and description are required. 409 `skill_name_taken` / `skill_limit`. */
  async createSkill(request: SaveRoutingSkillRequest): Promise<RoutingSkill> {
    return (await this.http.post<RoutingSkill>('/api/v1/workforce/skills', request)).data;
  }

  /** Needs `manage_workforce`. Omitted fields keep their value; `archived` restores or archives. */
  async updateSkill(id: string, request: SaveRoutingSkillRequest): Promise<RoutingSkill> {
    return (await this.http.put<RoutingSkill>(`/api/v1/workforce/skills/${seg(id)}`, request)).data;
  }

  /** Needs `manage_workforce`. Archives (never deletes) the skill. */
  async archiveSkill(id: string): Promise<RoutingSkill> {
    return (await this.http.delete<RoutingSkill>(`/api/v1/workforce/skills/${seg(id)}`)).data;
  }

  // -- Agent routing profile --------------------------------------------------------------

  /** Needs `manage_workforce`. 404 for an id that is not a member of this workspace. */
  async getAgentProfile(agentId: string): Promise<AgentProfile> {
    return (await this.http.get<AgentProfile>(`/api/v1/workforce/agents/${seg(agentId)}/profile`)).data;
  }

  /** Needs `manage_workforce`. `skills` replaces the agent's skills when present; 404 `skill_not_found` for an unknown skill id. */
  async saveAgentProfile(agentId: string, request: SaveAgentProfileRequest): Promise<AgentProfile> {
    return (await this.http.put<AgentProfile>(`/api/v1/workforce/agents/${seg(agentId)}/profile`, request)).data;
  }

  // -- Settings ----------------------------------------------------------------------------

  /** Needs `view_conversations` or `manage_workforce`. */
  async getSettings(): Promise<WorkforceSettings> {
    return (await this.http.get<WorkforceSettings>('/api/v1/workforce/settings')).data;
  }

  /**
   * Needs `manage_workforce`. A partial update: only the fields you set are sent, so an omitted
   * field keeps its stored value. `0` turns `idleAwayMinutes`, `signOutAfterHoursMinutes` or
   * `autoAwayAfterMissedOffers` off. 403 `plan_required` when turning AI routing on without plan support.
   */
  async updateSettings(request: UpdateWorkforceSettingsRequest): Promise<WorkforceSettings> {
    const body: UpdateWorkforceSettingsRequest = {};
    if (request.statusOnSignIn !== undefined) body.statusOnSignIn = request.statusOnSignIn;
    if (request.requireAwayReason !== undefined) body.requireAwayReason = request.requireAwayReason;
    if (request.idleAwayMinutes !== undefined) body.idleAwayMinutes = request.idleAwayMinutes;
    if (request.signOutAfterHoursMinutes !== undefined) body.signOutAfterHoursMinutes = request.signOutAfterHoursMinutes;
    if (request.autoAwayAfterMissedOffers !== undefined) body.autoAwayAfterMissedOffers = request.autoAwayAfterMissedOffers;
    if (request.routing !== undefined) {
      const routing: NonNullable<UpdateWorkforceSettingsRequest['routing']> = {};
      for (const [key, value] of Object.entries(request.routing)) {
        if (value !== undefined) (routing as Record<string, unknown>)[key] = value;
      }
      body.routing = routing;
    }
    return (await this.http.put<WorkforceSettings>('/api/v1/workforce/settings', body)).data;
  }

  // -- Chat offers (offerMode `ring`; member token) --------------------------------------------

  /** Member token. The caller's open offers, for a client that reconnected after the push. */
  async listMyOffers(): Promise<ChatOfferSummary[]> {
    return (await this.http.get<{ items: ChatOfferSummary[] }>('/api/v1/workforce/offers/mine')).data.items;
  }

  /** Member token. Returns the assigned conversation id. 404 `offer_not_found`; 409 `offer_expired` / `offer_taken` / `offer_closed`; 403 `access_revoked`. */
  async acceptOffer(offerId: string): Promise<{ conversationId: string }> {
    return (await this.http.post<{ conversationId: string }>(`/api/v1/workforce/offers/${seg(offerId)}/accept`)).data;
  }

  /** Member token. 404 `offer_not_found`; 409 `offer_expired` / `offer_closed`. */
  async declineOffer(offerId: string): Promise<void> {
    await this.http.post(`/api/v1/workforce/offers/${seg(offerId)}/decline`);
  }

  // -- Why me -------------------------------------------------------------------------------------

  /**
   * Why a chat went to its agent. Needs `view_conversations` (a member token): a supervisor
   * (`view_insights`) sees every candidate and offer, the assignee only their own rows; anyone
   * else gets 404.
   */
  async getRoutingDecision(conversationId: string): Promise<RoutingDecision> {
    return (await this.http.get<RoutingDecision>(`/api/v1/conversations/${seg(conversationId)}/routing-decision`)).data;
  }

  // -- Reports (view_insights, plan gated, range at most 92 days) ----------------------------------

  /** Time per status and reason, per agent, team or day. */
  async getAgentStatusReport(query?: WorkforceReportQuery): Promise<WorkforceReport> {
    return (await this.http.get<WorkforceReport>('/api/v1/reports/agent-status', { params: reportParams(query) })).data;
  }

  /** Status intervals of one agent (state, reason, source, `overLimitSeconds`). The supervisor `note` is `null` for an API key. */
  async getAgentStatusTimeline(agentId: string, query?: WorkforceReportQuery): Promise<WorkforceReport> {
    return (
      await this.http.get<WorkforceReport>('/api/v1/reports/agent-status/timeline', {
        params: reportParams(query, agentId),
      })
    ).data;
  }

  /** Workload, utilisation and offer metrics per agent, team or day. */
  async getAgentPerformanceReport(query?: WorkforceReportQuery): Promise<WorkforceReport> {
    return (
      await this.http.get<WorkforceReport>('/api/v1/reports/agent-performance', { params: reportParams(query) })
    ).data;
  }

  /** The status report as CSV text (UTF-8 with a byte-order mark; depending on the runtime the string may drop it). */
  async exportAgentStatusCsv(query?: WorkforceReportQuery): Promise<string> {
    return (
      await this.http.get<string>('/api/v1/reports/agent-status/export.csv', {
        params: reportParams(query),
        responseType: 'text',
      })
    ).data;
  }

  /** The performance report as CSV text. */
  async exportAgentPerformanceCsv(query?: WorkforceReportQuery): Promise<string> {
    return (
      await this.http.get<string>('/api/v1/reports/agent-performance/export.csv', {
        params: reportParams(query),
        responseType: 'text',
      })
    ).data;
  }
}
