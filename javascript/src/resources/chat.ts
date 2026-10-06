import { ErghiClient } from '../client';
import { ErghiError } from '../errors';
import {
  Message,
  Conversation,
  SendMessageRequest,
  PaginationParams,
  PaginatedResponse,
  Widget,
  CreateWidgetRequest,
  Attachment,
  CreateConversationOptions,
  SecureContextOptions,
  SecureContextResult,
} from '../types';

/**
 * Chat resource
 */
export class ChatResource {
  constructor(private client: ErghiClient) {}

  /**
   * Get conversation by ID
   */
  async getConversation(conversationId: string): Promise<Conversation> {
    const response = await this.client.getHttpClient().get<Conversation>(
      `/api/conversations/${conversationId}`,
      { headers: this.visitorHeaders(conversationId) }
    );
    return response.data;
  }

  /**
   * List conversations
   */
  async listConversations(params?: PaginationParams): Promise<PaginatedResponse<Conversation>> {
    const response = await this.client.getHttpClient().get<PaginatedResponse<Conversation>>(
      '/api/conversations',
      { params }
    );
    return response.data;
  }

  /**
   * Create a widget for the authenticated workspace (POST /api/widgets).
   */
  async createWidget(data: CreateWidgetRequest): Promise<Widget> {
    const response = await this.client.getHttpClient().post<Widget>('/api/widgets', data);
    return response.data;
  }

  /**
   * Create a new conversation
   */
  async createConversation(
    widgetId: string,
    metadata?: Record<string, any>,
    options: CreateConversationOptions = {}
  ): Promise<Conversation> {
    const payload: any = { widgetId, metadata };
    const visitorId = this.client.getVisitorId();
    if (visitorId) {
      payload.visitorId = visitorId;
    }
    if (options.identityToken) {
      payload.identityToken = options.identityToken;
    }
    const response = await this.client.getHttpClient().post<Conversation>('/api/conversations', payload);
    const conversation = response.data;
    if (conversation.visitorToken) {
      this.client.setVisitorToken(conversation.id, conversation.visitorToken);
    }
    return conversation;
  }

  /**
   * Attach (or refresh) a signed identity JWT on an existing conversation. A token for a
   * different user than the one already attached is refused (409).
   */
  async attachIdentityToken(conversationId: string, identityToken: string): Promise<void> {
    await this.client.getHttpClient().post(
      `/api/conversations/${conversationId}/identity-token`,
      { identityToken },
      { headers: this.requireVisitorHeaders(conversationId) }
    );
  }

  /**
   * Store values only the workspace's integrations can use (e.g. the signed-in user's access
   * token, bound as `{{secret.<key>}}`). The AI never sees them; they expire after ttlSeconds.
   * Call again with fresh values whenever your token is renewed.
   */
  async setSecureContext(
    conversationId: string,
    values: Record<string, string>,
    options: SecureContextOptions = {}
  ): Promise<SecureContextResult> {
    const response = await this.client.getHttpClient().put<SecureContextResult>(
      `/api/conversations/${conversationId}/secure-context`,
      { values, ttlSeconds: options.ttlSeconds, merge: options.merge ?? true },
      { headers: this.requireVisitorHeaders(conversationId) }
    );
    return response.data;
  }

  /** Remove every secure value from a conversation (e.g. on sign-out). */
  async clearSecureContext(conversationId: string): Promise<void> {
    await this.client.getHttpClient().delete(
      `/api/conversations/${conversationId}/secure-context`,
      { headers: this.requireVisitorHeaders(conversationId) }
    );
  }

  /**
   * Close conversation. Operator-only: needs an access token or API key, not a visitor token.
   */
  async closeConversation(conversationId: string): Promise<void> {
    await this.client.getHttpClient().post(`/api/conversations/${conversationId}/close`);
  }

  /**
   * Send a message. Files in `attachments` are uploaded first (images, PDF or plain text,
   * up to the workspace's size limit), then the message is posted with references to them.
   * As a visitor, the conversation's visitor token is sent automatically.
   */
  async sendMessage(data: SendMessageRequest): Promise<Message> {
    const attachments: Attachment[] = [];
    for (const file of data.attachments ?? []) {
      attachments.push(await this.uploadAttachment(data.conversationId, file));
    }

    const response = await this.client.getHttpClient().post<Message>(
      `/api/conversations/${data.conversationId}/messages`,
      {
        content: data.content,
        type: data.type ?? 'text',
        attachments: attachments.length > 0 ? attachments : undefined,
      },
      { headers: this.visitorHeaders(data.conversationId) }
    );
    return response.data;
  }

  /** Upload one file to a conversation; pass the result in a message's attachments. */
  async uploadAttachment(conversationId: string, file: Blob, filename?: string): Promise<Attachment> {
    const form = new FormData();
    const name = filename ?? (file as File).name ?? 'attachment';
    form.append('file', file, name);
    const response = await this.client.getHttpClient().post<Attachment>(
      `/api/conversations/${conversationId}/attachments`,
      form,
      { headers: this.visitorHeaders(conversationId) }
    );
    return response.data;
  }

  /**
   * Send a recorded voice note as the visitor. The platform transcribes it and posts the
   * transcript as the visitor's message (`source: 'voice'`); the audio itself is not stored.
   * Up to 60 seconds / 2 MB of WebM, Ogg, MP4/M4A, MP3 or WAV. On failure the server's code
   * (`voice_disabled`, `voice_no_speech`, ...) is in `ErghiError.details.code`; the monthly
   * voice-minute limit arrives as a `RateLimitError` (429).
   */
  async sendVoiceMessage(conversationId: string, audio: Blob, filename?: string): Promise<Message> {
    const form = new FormData();
    form.append('file', audio, filename ?? (audio as File).name ?? 'voice-note.webm');
    const response = await this.client.getHttpClient().post<Message>(
      `/api/conversations/${conversationId}/voice`,
      form,
      { headers: this.requireVisitorHeaders(conversationId) }
    );
    return response.data;
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(
    conversationId: string,
    params?: PaginationParams
  ): Promise<PaginatedResponse<Message>> {
    const response = await this.client.getHttpClient().get<PaginatedResponse<Message>>(
      `/api/conversations/${conversationId}/messages`,
      { params, headers: this.visitorHeaders(conversationId) }
    );
    return response.data;
  }

  /**
   * Mark message as read. Operator-only: needs an access token or API key.
   */
  async markAsRead(conversationId: string, messageId: string): Promise<void> {
    await this.client.getHttpClient().post(
      `/api/conversations/${conversationId}/messages/${messageId}/read`
    );
  }

  /**
   * Send typing indicator
   */
  sendTyping(conversationId: string): void {
    this.client.send('user.typing', { conversationId });
  }

  /** X-Visitor-Token for this conversation when the client holds one; operators send none and
   * authenticate with their access token or API key instead. */
  private visitorHeaders(conversationId: string): Record<string, string> {
    const token = this.client.getVisitorToken(conversationId);
    return token ? { 'X-Visitor-Token': token } : {};
  }

  /** For calls only the visitor's own client may make. */
  private requireVisitorHeaders(conversationId: string): Record<string, string> {
    const headers = this.visitorHeaders(conversationId);
    if (!headers['X-Visitor-Token']) {
      throw new ErghiError(
        'No visitor token for this conversation; create it with chat.createConversation or call client.setVisitorToken',
        'VISITOR_TOKEN_MISSING'
      );
    }
    return headers;
  }
}
