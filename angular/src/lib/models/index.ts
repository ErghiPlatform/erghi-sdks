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

export type InsightSentiment = 'Positive' | 'Neutral' | 'Negative';
export type InsightOutcome = 'ResolvedByAi' | 'ResolvedByAgent' | 'HandedOffUnresolved' | 'Abandoned' | 'SpamOrEmpty';

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
  /** Reopened after this was written; reclassified on its next close. */
  stale: boolean;
}

export interface InsightPage {
  total: number;
  page: number;
  pageSize: number;
  items: InsightConversation[];
}
