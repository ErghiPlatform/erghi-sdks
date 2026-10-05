export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  workspaceId: string;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  workspaceId?: string;
}

export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
}

export interface Message {
  id: string;
  conversationId: string;
  content: string;
  sender: 'visitor' | 'agent' | 'system' | 'ai';
  senderId?: string;
  type: 'text' | 'image' | 'file';
  createdAt: string;
  isRead: boolean;
  isAI?: boolean;
  attachments?: Attachment[];
}

export interface Conversation {
  id: string;
  workspaceId: string;
  widgetId: string;
  visitorId?: string;
  assignedAgentId?: string;
  status: 'open' | 'assigned' | 'closed';
  metadata?: Record<string, any>;
  createdAt: string;
  closedAt?: string;
  /** Returned by conversation create only; required as X-Visitor-Token on later visitor calls. */
  visitorToken?: string;
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
  configuration: WidgetConfiguration;
  createdAt: string;
}

export interface WidgetConfiguration {
  theme?: string;
  primaryColor?: string;
  position?: 'bottom-left' | 'bottom-right';
  greeting?: string;
  avatar?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  statusCode: number;
  errors?: Record<string, string[]>;
}
