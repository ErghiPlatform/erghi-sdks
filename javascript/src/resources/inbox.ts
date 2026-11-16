import { ErghiClient } from '../client';
import {
  CannedResponse,
  CannedResponseList,
  Conversation,
  ConversationLabel,
  ConversationLabelList,
  ConversationNote,
  MentionableMember,
  SaveCannedResponseRequest,
  SaveConversationLabelRequest,
  SaveConversationNoteRequest,
  UserNotification,
} from '../types';

const seg = (id: string) => encodeURIComponent(id);

/**
 * Inbox working data: conversation labels, private notes, saved replies, and the signed-in
 * teammate's notifications.
 *
 * These are workspace (admin / server-side) operations. The workspace comes from the API key or
 * access token, never from a parameter. Reading needs `view_conversations`; creating, editing and
 * deleting labels and saved replies needs `manage_inbox_settings`. Notes are written by workspace
 * members: API keys cannot hold the needed permissions at all (403); notes need a member token.
 */
export class InboxResource {
  constructor(private client: ErghiClient) {}

  private get http() {
    return this.client.getHttpClient();
  }

  // -- Labels ---------------------------------------------------------------

  /** The workspace's labels and the per-workspace limit. */
  async listLabels(): Promise<ConversationLabelList> {
    return (await this.http.get<ConversationLabelList>('/api/v1/conversation-labels')).data;
  }

  /** Needs `manage_inbox_settings`. 409 `label_name_taken` / `label_limit_reached`. */
  async createLabel(request: SaveConversationLabelRequest): Promise<ConversationLabel> {
    return (await this.http.post<ConversationLabel>('/api/v1/conversation-labels', request)).data;
  }

  /** Needs `manage_inbox_settings`. */
  async updateLabel(labelId: string, request: SaveConversationLabelRequest): Promise<ConversationLabel> {
    return (await this.http.put<ConversationLabel>(`/api/v1/conversation-labels/${seg(labelId)}`, request)).data;
  }

  /** Needs `manage_inbox_settings`. Also removes the label from every conversation. */
  async deleteLabel(labelId: string): Promise<void> {
    await this.http.delete(`/api/v1/conversation-labels/${seg(labelId)}`);
  }

  /** The labels on one conversation. */
  async getConversationLabels(conversationId: string): Promise<ConversationLabel[]> {
    return (await this.http.get<ConversationLabel[]>(`/api/v1/conversations/${seg(conversationId)}/labels`)).data;
  }

  /** Replaces the conversation's labels with exactly `labelIds`. Returns the new set. */
  async setConversationLabels(conversationId: string, labelIds: string[]): Promise<ConversationLabel[]> {
    return (
      await this.http.put<ConversationLabel[]>(`/api/v1/conversations/${seg(conversationId)}/labels`, { labelIds })
    ).data;
  }

  /** Adds one label (a no-op if already present). Returns the conversation's labels. */
  async addConversationLabel(conversationId: string, labelId: string): Promise<ConversationLabel[]> {
    return (
      await this.http.post<ConversationLabel[]>(
        `/api/v1/conversations/${seg(conversationId)}/labels/${seg(labelId)}`,
      )
    ).data;
  }

  /** Removes one label (a no-op if absent). Returns the conversation's labels. */
  async removeConversationLabel(conversationId: string, labelId: string): Promise<ConversationLabel[]> {
    return (
      await this.http.delete<ConversationLabel[]>(
        `/api/v1/conversations/${seg(conversationId)}/labels/${seg(labelId)}`,
      )
    ).data;
  }

  // -- Conversation notes ---------------------------------------------------

  async listNotes(conversationId: string): Promise<ConversationNote[]> {
    return (await this.http.get<ConversationNote[]>(`/api/v1/conversations/${seg(conversationId)}/notes`)).data;
  }

  /** Needs a member token (API keys get 403). `mentionedUserIds` requires platform PR #256. */
  async createNote(conversationId: string, request: SaveConversationNoteRequest): Promise<ConversationNote> {
    return (
      await this.http.post<ConversationNote>(`/api/v1/conversations/${seg(conversationId)}/notes`, request)
    ).data;
  }

  /** Only the author can edit (403 `note_not_author`). */
  async updateNote(
    conversationId: string,
    noteId: string,
    request: SaveConversationNoteRequest,
  ): Promise<ConversationNote> {
    return (
      await this.http.put<ConversationNote>(
        `/api/v1/conversations/${seg(conversationId)}/notes/${seg(noteId)}`,
        request,
      )
    ).data;
  }

  /** The author or someone with `manage_inbox_settings` can delete. */
  async deleteNote(conversationId: string, noteId: string): Promise<void> {
    await this.http.delete(`/api/v1/conversations/${seg(conversationId)}/notes/${seg(noteId)}`);
  }

  // -- Saved replies --------------------------------------------------------

  /** Saved replies, optionally filtered by short code prefix or content text. */
  async listCannedResponses(search?: string): Promise<CannedResponseList> {
    const params = search ? { search } : {};
    return (await this.http.get<CannedResponseList>('/api/v1/canned-responses', { params })).data;
  }

  /** Needs `manage_inbox_settings`. 409 `canned_response_short_code_taken`. */
  async createCannedResponse(request: SaveCannedResponseRequest): Promise<CannedResponse> {
    return (await this.http.post<CannedResponse>('/api/v1/canned-responses', request)).data;
  }

  /** Needs `manage_inbox_settings`. */
  async updateCannedResponse(id: string, request: SaveCannedResponseRequest): Promise<CannedResponse> {
    return (await this.http.put<CannedResponse>(`/api/v1/canned-responses/${seg(id)}`, request)).data;
  }

  /** Needs `manage_inbox_settings`. */
  async deleteCannedResponse(id: string): Promise<void> {
    await this.http.delete(`/api/v1/canned-responses/${seg(id)}`);
  }

  // -- Assignment, notifications, mentions (require platform PR #256) --------

  /** Returns the conversation to the queue. Requires platform PR #256. 409 for resolved or closed conversations. */
  async unassignConversation(conversationId: string): Promise<Conversation> {
    return (await this.http.post<Conversation>(`/api/conversations/${seg(conversationId)}/unassign`)).data;
  }

  /**
   * The signed-in teammate's notifications, newest first. Requires platform PR #256. Notifications
   * belong to a member, so an API key gets an empty list.
   */
  async listNotifications(options: { unreadOnly?: boolean; limit?: number } = {}): Promise<UserNotification[]> {
    const params: Record<string, string | number | boolean> = {};
    if (options.unreadOnly) params.unreadOnly = true;
    if (options.limit !== undefined) params.limit = options.limit;
    return (await this.http.get<UserNotification[]>('/api/v1/notifications', { params })).data;
  }

  /** Requires platform PR #256. */
  async getUnreadNotificationCount(): Promise<number> {
    return (await this.http.get<{ count: number }>('/api/v1/notifications/unread-count')).data.count;
  }

  /** Requires platform PR #256. */
  async markNotificationRead(notificationId: string): Promise<void> {
    await this.http.post(`/api/v1/notifications/${seg(notificationId)}/read`);
  }

  /** Requires platform PR #256. */
  async markAllNotificationsRead(): Promise<void> {
    await this.http.post('/api/v1/notifications/read-all');
  }

  /** Teammates who can be @mentioned in a note. Requires platform PR #256. */
  async listMentionableMembers(): Promise<MentionableMember[]> {
    return (await this.http.get<MentionableMember[]>('/api/v1/team/mentionable')).data;
  }
}
