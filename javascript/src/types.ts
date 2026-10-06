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
  /** 'voice' when the visitor sent it as a voice note (content is the transcript). */
  source?: string;
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
  /** Returned by conversation create only: the per-conversation credential every later
   * visitor call (X-Visitor-Token) needs. */
  visitorToken?: string;
}

export interface CreateConversationOptions {
  /** Identity JWT your backend signed with the workspace's widget secret (HS256, `sub` and
   * `exp` required). Gives the conversation a verified identity (`identity.*`). */
  identityToken?: string;
}

export interface SecureContextOptions {
  /** 60 to 86400 seconds, default 3600. */
  ttlSeconds?: number;
  /** Merge with values already stored (default) or replace them all. */
  merge?: boolean;
}

export interface SecureContextResult {
  expiresAt: string;
  keys: string[];
}

export interface Widget {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  isActive: boolean;
  configuration?: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateWidgetRequest {
  name: string;
  slug: string;
  configuration?: Record<string, any>;
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
  | 'conversation.closed'
  | 'conversation.escalated'
  | 'conversation.inactivity_warning'
  | 'context.required'
  | 'conversation.resumed';

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
