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

/** Conversation statuses as the API returns them (PascalCase), plus the lowercase spellings older typings used. */
export type ConversationStatus =
  | 'Open' | 'Assigned' | 'Queued' | 'Snoozed' | 'Resolved' | 'Closed'
  | 'open' | 'assigned' | 'queued' | 'snoozed' | 'resolved' | 'closed';

export type MessageKind = 'Text' | 'Image' | 'File' | 'System' | 'text' | 'image' | 'file' | 'system';

export interface Message {
  id: string;
  conversationId: string;
  /** As the API sends it: 'visitor', 'agent', 'bot' (the AI assistant), 'system', 'user'. */
  sender: 'visitor' | 'agent' | 'bot' | 'user' | 'system' | 'ai';
  senderId?: string;
  /** The API sends PascalCase ('Text'); lowercase is kept so existing comparisons still compile. */
  type: MessageKind;
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
  /** The API sends PascalCase ('Open'); lowercase is kept so existing comparisons still compile. */
  status: ConversationStatus;
  /** 'web_widget', 'whatsapp', 'telegram', 'email', 'slack'... new channels can appear. */
  channel: string;
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
  /** `null` when the plan locks it. */
  topic: string | null;
  category: string | null;
  sentiment: InsightSentiment;
  sentimentEnd: InsightSentiment;
  outcome: InsightOutcome;
  /** BCP-47 language tag the classifier detected. */
  language: string | null;
  summary: string | null;
  /** 0 to 1. */
  confidence: number | null;
  classifiedAt: string;
  /** The conversation was reopened after this was written; it is reclassified on its next close. */
  stale: boolean;
}

export interface InsightPage {
  total: number;
  page: number;
  pageSize: number;
  items: InsightConversation[];
  plan: string;
  /** Fields the plan locks (their values are `null` on each item). */
  locked: string[];
  windowDays: number;
  /** Effective start of the window (ISO 8601). */
  from: string;
}

export interface ErrorResponse {
  error: string;
  message?: string;
  errors?: Record<string, string[]>;
  statusCode: number;
  traceId?: string;
}

// ---------------------------------------------------------------------------
// Inbox: labels, notes, saved replies, contacts, notifications
// ---------------------------------------------------------------------------

/** A workspace conversation label. `color` is a server-assigned or chosen hex colour. */
export interface ConversationLabel {
  id: string;
  name: string;
  color: string;
  description: string | null;
}

export interface ConversationLabelList {
  maxLabels: number;
  labels: ConversationLabel[];
}

export interface SaveConversationLabelRequest {
  name: string;
  color?: string | null;
  description?: string | null;
}

/** A private (internal-only) note on a conversation. Visitors never see notes. */
export interface ConversationNote {
  id: string;
  conversationId: string;
  authorId: string;
  authorName: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
}

export interface SaveConversationNoteRequest {
  content: string;
  /**
   * Teammates @mentioned in the note; each active member gets an in-app notification.
   * Requires platform PR #256.
   */
  mentionedUserIds?: string[];
}

export interface CannedResponse {
  id: string;
  shortCode: string;
  content: string;
  updatedAt: string;
}

export interface CannedResponseList {
  maxResponses: number;
  responses: CannedResponse[];
}

export interface SaveCannedResponseRequest {
  shortCode: string;
  content: string;
}

/** Requires platform PR #256. */
export interface ContactSummary {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  externalId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  blocked: boolean;
  conversationCount: number;
}

export interface ContactConversation {
  id: string;
  channel: string;
  status: string;
  startedAt: string;
  closedAt: string | null;
  assignedAgentId: string | null;
}

export interface ContactDetail {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  externalId: string | null;
  locale: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  blocked: boolean;
  blockedAt: string | null;
  conversations: ContactConversation[];
}

export interface ContactPage {
  items: ContactSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ContactListParams {
  /** Matches name, email, phone or external id (max 100 characters). */
  search?: string;
  blocked?: boolean;
  page?: number;
  /** Capped at 100 by the server. */
  pageSize?: number;
}

/** `undefined`/omitted leaves a field unchanged; an empty string clears it. */
export interface UpdateContactRequest {
  name?: string;
  email?: string;
  phone?: string;
}

export interface ContactNote {
  id: string;
  contactId: string;
  authorId: string;
  authorName: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
}

export interface ContactEraseResult {
  conversationsDeleted: number;
  messagesDeleted: number;
}

/** Requires platform PR #256. */
export interface UserNotification {
  id: string;
  type: string;
  conversationId: string | null;
  noteId: string | null;
  actorId: string | null;
  actorName: string | null;
  preview: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface MentionableMember {
  userId: string;
  displayName: string | null;
}
