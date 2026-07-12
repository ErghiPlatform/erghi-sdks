import { ErghiClient } from '../client';
import {
  Message,
  Conversation,
  SendMessageRequest,
  PaginationParams,
  PaginatedResponse,
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
   * Create a new conversation
   */
  async createConversation(widgetId: string, metadata?: Record<string, any>): Promise<Conversation> {
    const payload: any = { widgetId, metadata };
    const visitorId = this.client.getVisitorId();
    if (visitorId) {
      payload.visitorId = visitorId;
    }
    const response = await this.client.getHttpClient().post<Conversation>('/api/conversations', payload);
    return response.data;
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
