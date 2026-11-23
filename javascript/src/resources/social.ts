import { ErghiClient } from '../client';
import {
  SocialComment,
  SocialCommentQuery,
  SocialConnection,
  SocialConnectionSettings,
  SocialDisconnectPreview,
  SocialMessageDelivery,
  SocialPage,
  SocialPost,
  SocialPostQuery,
  SocialPrivateReplyResult,
  SocialReplyPolicy,
  SocialReport,
  UpdateSocialConnectionSettingsRequest,
} from '../types';

const seg = (id: string) => encodeURIComponent(id);
const iso = (v: string | Date) => (v instanceof Date ? v.toISOString() : v);

function pageParams(query: SocialPostQuery = {}): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {};
  if (query.connectionId) params.connectionId = query.connectionId;
  if (query.page !== undefined) params.page = query.page;
  if (query.pageSize !== undefined) params.pageSize = query.pageSize;
  return params;
}

/**
 * Social inbox (Facebook and Instagram): connected accounts and their settings, comment
 * moderation, reply windows, and the social report.
 *
 * Workspace (admin / server-side) operations; the workspace comes from the credential. The social
 * inbox ships dark: a workspace without it gets 403 `social_inbox_unavailable`. Permissions:
 * connections and settings need `configure_ai`; reading posts and comments needs
 * `view_conversations` or an API key with `moderate_social`; hide, reply, private reply, done and
 * ignore need `moderate_social`; the report needs `view_insights`.
 *
 * Connecting an account is a browser-only Meta login and is not wrapped here; connect in the
 * admin portal. Errors carry the server's code in `error.details.code` (for example
 * `private_reply_used`, `private_reply_expired`, `needs_reauth`, `connection_unavailable`,
 * `meta_error`).
 *
 * Replying to a comment conversation through the normal conversation send path is refused with
 * 409 `use_comment_reply`; use `replyToComment` or `privateReplyToComment` instead.
 */
export class SocialResource {
  constructor(private client: ErghiClient) {}

  private get http() {
    return this.client.getHttpClient();
  }

  // -- Connections (configure_ai) -----------------------------------------------------------

  /** Active Facebook Pages and Instagram accounts of the workspace. */
  async listConnections(): Promise<SocialConnection[]> {
    return (await this.http.get<SocialConnection[]>('/api/v1/channels/meta/connections')).data;
  }

  async getConnectionSettings(connectionId: string): Promise<SocialConnectionSettings> {
    return (await this.http.get<SocialConnectionSettings>(`/api/v1/channels/meta/connections/${seg(connectionId)}/settings`))
      .data;
  }

  /**
   * A partial update: only the fields you set are sent. Turning `dmsEnabled` / `commentsEnabled`
   * on is refused (400 `capability_requires_reconnect`); invalid link domains answer 400 with a
   * code such as `domain_too_broad`, `shared_host_not_allowed` or `domain_must_not_have_path`.
   */
  async updateConnectionSettings(
    connectionId: string,
    request: UpdateSocialConnectionSettingsRequest,
  ): Promise<SocialConnectionSettings> {
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(request)) {
      if (value !== undefined) body[key] = value;
    }
    return (
      await this.http.put<SocialConnectionSettings>(
        `/api/v1/channels/meta/connections/${seg(connectionId)}/settings`,
        body,
      )
    ).data;
  }

  /** What disconnecting would affect. Call it before `disconnectConnection`. */
  async getDisconnectPreview(connectionId: string): Promise<SocialDisconnectPreview> {
    return (
      await this.http.get<SocialDisconnectPreview>(`/api/v1/channels/meta/connections/${seg(connectionId)}/disconnect-preview`)
    ).data;
  }

  /** Disconnects the account and deletes its stored access token. Reconnecting needs the browser Meta login. */
  async disconnectConnection(connectionId: string): Promise<void> {
    await this.http.delete(`/api/v1/channels/meta/connections/${seg(connectionId)}`);
  }

  // -- Direct messages -------------------------------------------------------------------------

  /** The DM reply window of a Messenger or Instagram conversation (needs `view_conversations`, a member token). */
  async getReplyPolicy(conversationId: string): Promise<SocialReplyPolicy> {
    return (await this.http.get<SocialReplyPolicy>(`/api/v1/channels/meta/conversations/${seg(conversationId)}/reply-policy`))
      .data;
  }

  /** Delivery state of the outbound messages of a Messenger or Instagram conversation (member token). */
  async listDeliveries(conversationId: string): Promise<SocialMessageDelivery[]> {
    return (
      await this.http.get<SocialMessageDelivery[]>(`/api/v1/channels/meta/conversations/${seg(conversationId)}/deliveries`)
    ).data;
  }

  // -- Posts and comments -------------------------------------------------------------------------

  /** Posts that have comments you may see, newest comment first. */
  async listPosts(query?: SocialPostQuery): Promise<SocialPage<SocialPost>> {
    return (await this.http.get<SocialPage<SocialPost>>('/api/v1/social/posts', { params: pageParams(query) })).data;
  }

  /** Comments, newest first. `pageSize` is capped at 100. 400 `invalid_category` for an unknown category. */
  async listComments(query: SocialCommentQuery = {}): Promise<SocialPage<SocialComment>> {
    const params = pageParams(query);
    if (query.postId) params.postId = query.postId;
    if (query.category) params.category = query.category;
    if (query.hidden !== undefined) params.hidden = query.hidden;
    if (query.needsAttention !== undefined) params.needsAttention = query.needsAttention;
    if (query.unanswered !== undefined) params.unanswered = query.unanswered;
    return (await this.http.get<SocialPage<SocialComment>>('/api/v1/social/comments', { params })).data;
  }

  /** Needs `moderate_social`. Hides the comment on Meta (reversible; it is never deleted). */
  async hideComment(commentId: string): Promise<SocialComment> {
    return (await this.http.post<SocialComment>(`/api/v1/social/comments/${seg(commentId)}/hide`)).data;
  }

  /** Needs `moderate_social`. */
  async unhideComment(commentId: string): Promise<SocialComment> {
    return (await this.http.post<SocialComment>(`/api/v1/social/comments/${seg(commentId)}/unhide`)).data;
  }

  /** Needs `moderate_social`. Posts a public reply. 409 `cannot_reply` / `needs_reauth` / `connection_unavailable`. */
  async replyToComment(commentId: string, text: string): Promise<SocialComment> {
    return (await this.http.post<SocialComment>(`/api/v1/social/comments/${seg(commentId)}/reply`, { text })).data;
  }

  /**
   * Needs `moderate_social`. Sends the commenter a DM and opens the DM conversation. Meta allows
   * one per comment within 7 days: 409 `private_reply_used` / `private_reply_expired`.
   */
  async privateReplyToComment(commentId: string, text: string): Promise<SocialPrivateReplyResult> {
    return (
      await this.http.post<SocialPrivateReplyResult>(`/api/v1/social/comments/${seg(commentId)}/private-reply`, { text })
    ).data;
  }

  /** Needs `moderate_social`. Marks the comment handled (closes its conversation when nothing else is open). */
  async markCommentDone(commentId: string): Promise<SocialComment> {
    return (await this.http.post<SocialComment>(`/api/v1/social/comments/${seg(commentId)}/done`)).data;
  }

  /** Needs `moderate_social`. Blocks the commenter inside Erghi only; Meta's block API is never called. */
  async ignoreCommentContact(commentId: string): Promise<{ contactId: string; ignored: boolean }> {
    return (
      await this.http.post<{ contactId: string; ignored: boolean }>(`/api/v1/social/comments/${seg(commentId)}/ignore-contact`)
    ).data;
  }

  // -- Report (view_insights) ----------------------------------------------------------------------

  /** Comment volume, moderation, response times and DM volume. Default range is 30 days. */
  async getReport(query: { from?: string | Date; to?: string | Date; timeZone?: string } = {}): Promise<SocialReport> {
    return (await this.http.get<SocialReport>('/api/v1/reports/social', { params: this.reportParams(query) })).data;
  }

  /** The report as CSV text (UTF-8 with a byte-order mark; the string may or may not keep it). */
  async exportReportCsv(query: { from?: string | Date; to?: string | Date; timeZone?: string } = {}): Promise<string> {
    return (
      await this.http.get<string>('/api/v1/reports/social/export.csv', {
        params: this.reportParams(query),
        responseType: 'text',
      })
    ).data;
  }

  private reportParams(query: { from?: string | Date; to?: string | Date; timeZone?: string }) {
    const params: Record<string, string> = {};
    if (query.from !== undefined) params.from = iso(query.from);
    if (query.to !== undefined) params.to = iso(query.to);
    if (query.timeZone) params.timeZone = query.timeZone;
    return params;
  }
}
