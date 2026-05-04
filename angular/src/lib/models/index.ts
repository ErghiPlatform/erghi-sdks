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

export interface Message {
  id: string;
  conversationId: string;
  content: string;
  sender: 'visitor' | 'agent' | 'system';
  senderId?: string;
  type: 'text' | 'image' | 'file';
  createdAt: string;
  isRead: boolean;
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
