/**
 * Type definitions for Erghi SDK
 */

export interface ErghiConfig {
  /** API base URL */
  apiUrl?: string;
  /** WebSocket URL */
  wsUrl?: string;
  /** API Key for authentication */
  apiKey?: string;
  /** Access token (JWT) */
  accessToken?: string;
  /** Client ID for M2M authentication */
  clientId?: string;
  /** Client Secret for M2M authentication */
  clientSecret?: string;
  /** Workspace ID */
  workspaceId?: string;
  /** Account ID */
  accountId?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  role: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  twoFactorCode?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  user: User;
}

export interface Message {
  id: string;
  conversationId: string;
  sender: 'visitor' | 'agent' | 'system' | 'ai';
  senderId?: string;
  type: 'text' | 'image' | 'file' | 'system';
  content: string;
  attachments?: Attachment[];
  createdAt: string;
  readAt?: string;
  isAI: boolean;
  aiModel?: string;
}

export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
}

export interface Conversation {
  id: string;
  workspaceId: string;
  widgetId: string;
  visitorId?: string;
  assignedAgentId?: string;
  status: 'open' | 'assigned' | 'resolved' | 'closed';
  channel: 'web_widget' | 'email' | 'sms' | 'whatsapp';
  startedAt: string;
  closedAt?: string;
  metadata?: Record<string, any>;
}

export interface SendMessageRequest {
  conversationId: string;
  content: string;
  type?: 'text' | 'image' | 'file';
  attachments?: File[];
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  plan: 'free' | 'starter' | 'growth' | 'enterprise';
  role: string;
  createdAt: string;
}

export interface CreateWorkspaceRequest {
  name: string;
  slug?: string;
}

export interface WebSocketMessage {
  type: string;
  data: any;
}

export type WebSocketEventType =
  | 'message.received'
  | 'message.delivered'
  | 'message.read'
  | 'user.typing'
  | 'user.online'
  | 'user.offline'
  | 'conversation.assigned'
  | 'conversation.closed';

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ErrorResponse {
  error: string;
  message?: string;
  errors?: Record<string, string[]>;
  statusCode: number;
  traceId?: string;
}
