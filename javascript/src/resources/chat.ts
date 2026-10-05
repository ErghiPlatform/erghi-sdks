import { ErghiClient } from '../client';
import {
  Message,
  Conversation,
  SendMessageRequest,
  PaginationParams,
  PaginatedResponse,
  Widget,
  CreateWidgetRequest,
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
      `/api/conversations/${conversationId}`
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
    return response.data;
  }

  /**
   * Attach (or refresh) a signed identity JWT on an existing conversation. A token for a
   * different user than the one already attached is refused (409).
   */
  async attachIdentityToken(conversationId: string, visitorToken: string, identityToken: string): Promise<void> {
    await this.client.getHttpClient().post(
      `/api/conversations/${conversationId}/identity-token`,
      { identityToken },
      { headers: { 'X-Visitor-Token': visitorToken } }
    );
  }

  /**
   * Store values only the workspace's integrations can use (e.g. the signed-in user's access
   * token, bound as `{{secret.<key>}}`). The AI never sees them; they expire after ttlSeconds.
   * Call again with fresh values whenever your token is renewed.
   */
  async setSecureContext(
    conversationId: string,
    visitorToken: string,
    values: Record<string, string>,
    options: SecureContextOptions = {}
  ): Promise<SecureContextResult> {
    const response = await this.client.getHttpClient().put<SecureContextResult>(
      `/api/conversations/${conversationId}/secure-context`,
      { values, ttlSeconds: options.ttlSeconds, merge: options.merge ?? true },
      { headers: { 'X-Visitor-Token': visitorToken } }
    );
    return response.data;
  }

  /** Remove every secure value from a conversation (e.g. on sign-out). */
  async clearSecureContext(conversationId: string, visitorToken: string): Promise<void> {
    await this.client.getHttpClient().delete(
      `/api/conversations/${conversationId}/secure-context`,
      { headers: { 'X-Visitor-Token': visitorToken } }
    );
  }

  /**
   * Close conversation
   */
  async closeConversation(conversationId: string): Promise<void> {
    await this.client.getHttpClient().post(`/api/conversations/${conversationId}/close`);
  }

  /**
   * Send a message
   */
  async sendMessage(data: SendMessageRequest): Promise<Message> {
    const formData = new FormData();
    formData.append('content', data.content);
    if (data.type) {
      formData.append('type', data.type);
    }
    if (data.attachments) {
      data.attachments.forEach((file) => {
        formData.append('attachments', file);
      });
    }

    const response = await this.client.getHttpClient().post<Message>(
      `/api/conversations/${data.conversationId}/messages`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
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
      { params }
    );
    return response.data;
  }

  /**
   * Mark message as read
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
}
