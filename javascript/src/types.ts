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
  /** True for the workspace the current token is scoped to */
  isCurrent: boolean;
}

export interface CreateWorkspaceRequest {
  name: string;
  companyWebsite?: string;
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

export type InsightSentiment = 'Positive' | 'Neutral' | 'Negative';
export type InsightOutcome =
  | 'ResolvedByAi'
  | 'ResolvedByAgent'
  | 'HandedOffUnresolved'
  | 'Abandoned'
  | 'SpamOrEmpty';

/** Filters shared by insights summary, list and export. Dates are ISO 8601 (or a Date). */
export interface InsightFilter {
  from?: string | Date;
  to?: string | Date;
  channel?: string;
  category?: string;
  topic?: string;
  /** positive, neutral or negative (case-insensitive). */
  sentiment?: string;
  /** resolved_by_ai, resolved_by_agent, handed_off_unresolved, abandoned or spam_or_empty. */
  outcome?: string;
  /** 0 to 1. */
  minConfidence?: number;
}

export interface InsightPageParams {
  page?: number;
  /** Server caps this at 100. Default 25. */
  pageSize?: number;
  plan: string;
  /** Fields the plan locks (their values are `null` on each item). */
  locked: string[];
  windowDays: number;
  /** Effective start of the window (ISO 8601). */
  from: string;
}

export interface InsightCount {
  key: string;
  count: number;
}

export interface InsightSummary {
  total: number;
  /** AI-resolved over conversations that needed a reply (spam/empty excluded); null when none. */
  aiResolvedRate: number | null;
  outcomes: InsightCount[];
  sentiments: InsightCount[];
  /** `null` when the workspace's plan locks it (see `locked`). */
  categories: InsightCount[] | null;
  /** `null` when the workspace's plan locks it (see `locked`). */
  topics: InsightCount[] | null;
  /** `null` when the workspace's plan locks it (see `locked`). */
  languages: InsightCount[] | null;
  /** The workspace's effective plan (Free callers get a 403 `plan_upgrade_required` instead). */
  plan: string;
  /** Fields the plan locks, e.g. `['topics', 'categories', 'languages']` on Starter; empty when none. */
  locked: string[];
  /** Distinct topics and categories found while they are locked, e.g. `{ topics: 14 }`, so a UI can
   * say "14 topics found" without revealing them. */
  lockedCounts: Record<string, number>;
  /** Days of history the plan can read. */
  windowDays: number;
  /** Effective start of the window (ISO 8601) after clamping to `windowDays`. */
  from: string;
}

export interface InsightPageParams {
  page?: number;
  /** Server caps this at 100. Default 25. */
  pageSize?: number;
}

export interface InsightCount {
  key: string;
  count: number;
}

export interface InsightSummary {
  total: number;
  /** AI-resolved over conversations that needed a reply (spam/empty excluded); null when none. */
  aiResolvedRate: number | null;
  outcomes: InsightCount[];
  sentiments: InsightCount[];
  /** `null` when the workspace's plan locks it (see `locked`). */
  categories: InsightCount[] | null;
  /** `null` when the workspace's plan locks it (see `locked`). */
  topics: InsightCount[] | null;
  /** `null` when the workspace's plan locks it (see `locked`). */
  languages: InsightCount[] | null;
  /** The workspace's effective plan (Free callers get a 403 `plan_upgrade_required` instead). */
  plan: string;
  /** Fields the plan locks, e.g. `['topics', 'categories', 'languages']` on Starter; empty when none. */
  locked: string[];
  /** Distinct topics and categories found while they are locked, e.g. `{ topics: 14 }`, so a UI can
   * say "14 topics found" without revealing them. */
  lockedCounts: Record<string, number>;
  /** Days of history the plan can read. */
  windowDays: number;
  /** Effective start of the window (ISO 8601) after clamping to `windowDays`. */
  from: string;
}

export interface InsightConversation {
  conversationId: string;
  topic: string;
  category: string;
  sentiment: InsightSentiment;
  sentimentEnd: InsightSentiment;
  outcome: InsightOutcome;
  /** BCP-47 language tag the classifier detected. */
  language: string;
  summary: string;
  /** 0 to 1. */
  confidence: number;
  classifiedAt: string;
  /** The conversation was reopened after this was written; it is reclassified on its next close. */
  stale: boolean;
}

export interface InsightPage {
  total: number;
  page: number;
  pageSize: number;
  items: InsightConversation[];
}

export interface ErrorResponse {
  error: string;
  message?: string;
  errors?: Record<string, string[]>;
  statusCode: number;
  traceId?: string;
}
