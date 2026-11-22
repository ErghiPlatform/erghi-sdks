/**
 * Types for reply engines: your own agent answers a widget's visitors instead of Erghi AI.
 *
 * Admin types (`ReplyEngine`...) use the platform's camelCase JSON. Runtime types (`AgentReply`,
 * `TurnRequest`...) keep the platform's snake_case wire names, because the runtime REST bodies and
 * the turn payload are snake_case. Enum-like values the server sends as names ("Webhook",
 * "Active"...) are typed as a union plus `string`, so a value added later never breaks you.
 */

export type ReplyEngineMode = 'Webhook' | 'CustomModel' | 'LiveConnection' | 'Queue';
export type ReplyEngineFallback = 'ErghiAi' | 'Human' | 'FixedMessage';

/** Every writable field of an engine. Omit a field to keep the stored value (PATCH); `mode` cannot change after create. */
export interface ReplyEngineWrite {
  name?: string;
  mode?: ReplyEngineMode;
  timeoutSeconds?: number;
  fallback?: ReplyEngineFallback;
  fallbackMessages?: Record<string, string>;
  historyLimit?: number;
  includeContactDetails?: boolean;
  observeHumanMessages?: boolean;
  acceptSupersededReplies?: boolean;
  circuitFailureThreshold?: number;
  // Webhook
  url?: string;
  responseMode?: string;
  // Custom model
  baseUrl?: string;
  model?: string;
  contextMode?: string;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Write-only: never returned. */
  apiKey?: string;
  /** Write-only header values; the API returns only the header names. */
  extraHeaders?: Record<string, string>;
  // Live connection
  maxConnections?: number;
  // Queue
  turnsQueueUrl?: string;
  repliesQueueUrl?: string;
  region?: string;
  auth?: string;
  roleArn?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface ReplyEngine {
  id: string;
  name: string;
  mode: ReplyEngineMode | string;
  status: 'Active' | 'Disabled' | string;
  timeoutSeconds: number;
  fallback: ReplyEngineFallback | string;
  fallbackMessages?: Record<string, string> | null;
  historyLimit: number;
  includeContactDetails: boolean;
  observeHumanMessages: boolean;
  acceptSupersededReplies: boolean;
  circuitFailureThreshold: number;
  hasSecret: boolean;
  secretRotatedAt?: string | null;
  previousSecretExpiresAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  bindingCount: number;
  url?: string | null;
  responseMode?: string | null;
  baseUrl?: string | null;
  model?: string | null;
  contextMode?: string | null;
  stream?: boolean | null;
  temperature?: number | null;
  maxTokens?: number | null;
  hasApiKey?: boolean | null;
  extraHeaders?: string[] | null;
  maxConnections?: number | null;
  turnsQueueUrl?: string | null;
  repliesQueueUrl?: string | null;
  region?: string | null;
  auth?: string | null;
  roleArn?: string | null;
  externalId?: string | null;
  hasAccessKeys?: boolean | null;
  /** The `whsec_` signing secret: present only on the create and rotate-secret responses. Store it now. */
  secret?: string | null;
}

export interface ReplyEngineList {
  items: ReplyEngine[];
  allowedModes: string[];
  erghiPrincipalArn?: string | null;
}

export interface ReplyEngineName {
  id: string;
  name: string;
  mode: string;
  status: string;
}

/** A failing test is a normal answer (`ok: false` and an `errorCode`), not an exception. */
export interface ReplyEngineTestResult {
  ok: boolean;
  latencyMs: number;
  errorCode?: string | null;
  detail?: string | null;
  status?: number | null;
}

export interface ReplyEngineHealth {
  windowHours: number;
  turns: number;
  replied: number;
  fellBack: number;
  failed: number;
  timedOut: number;
  successRate?: number | null;
  p50FirstReplyMs?: number | null;
  p95FirstReplyMs?: number | null;
  circuit: {
    state: string;
    openedAt?: string | null;
    retryAt?: string | null;
    consecutiveFailures: number;
  };
}

export interface ReplyTurnLogItem {
  id: string;
  conversationId: string;
  status: string;
  isTest: boolean;
  sequence: number;
  createdAt?: string;
  dispatchedAt?: string | null;
  firstReplyAt?: string | null;
  closedAt?: string | null;
  firstReplyMs?: number | null;
  closeReason?: string | null;
  fallbackUsed?: string | null;
  errorCode?: string | null;
  errorDetail?: string | null;
  replyCount: number;
}

export interface ReplyTurnLogPage {
  items: ReplyTurnLogItem[];
  nextCursor?: string | null;
}

export interface ListReplyTurnsParams {
  cursor?: string;
  /** Up to 100. */
  limit?: number;
  includeTests?: boolean;
}

/** Current bindings of a widget. `default` is an engine id, `"erghi"` or null. */
export interface WidgetReplyEngine {
  default: string | null;
  channels: Record<string, string>;
  availableChannels: string[];
}

export interface SetWidgetReplyEngine {
  /** An engine id, `'erghi'` to pin Erghi AI explicitly, or null to remove the binding. */
  default?: string | null;
  /** Channel key (e.g. `'telegram'`) to an engine id, `'erghi'`, or null / `'default'`. */
  channels?: Record<string, string | null>;
}

// ---- Runtime (snake_case wire) ----

export interface AgentReplyMessage {
  /** 1-4000 characters, markdown like AI replies. */
  content: string;
  /** Validated against the workspace's chat-action policy. */
  actions?: unknown;
}

export interface AgentReply {
  /** Required, at most 100 characters, unique per turn. Reuse it when you retry. */
  idempotency_key: string;
  /** 1 to 5 messages (none with a handoff). */
  messages?: AgentReplyMessage[];
  /** false keeps the turn open for more replies. */
  final?: boolean;
  handoff?: { reason?: string };
}

export interface AgentReplyResult {
  turn_id: string;
  message_ids: string[];
}

export interface AgentTurn {
  turn_id: string;
  conversation_id: string;
  status: string;
  deadline_at?: string | null;
  is_test: boolean;
  reply_count: number;
  close_reason?: string | null;
}

export interface BotMessageResult {
  message_ids: string[];
}

export interface TurnAttachment {
  id?: string;
  file_name?: string;
  content_type?: string;
  size: number;
}

export interface TurnMessage {
  id: string;
  conversation_id: string;
  sender: string;
  sender_id?: string | null;
  is_ai: boolean;
  type: string;
  content?: string | null;
  attachments: TurnAttachment[];
  created_at: string;
  reply_origin?: string | null;
  reply_engine_name?: string | null;
}

/** A `turn.requested` event: the visitor's unanswered messages plus recent history. Answer before `deadline_at`. */
export interface TurnRequest {
  type: string;
  api_version?: string;
  turn_id: string;
  sequence: number;
  engine_id: string;
  workspace_id: string;
  deadline_at?: string;
  /** From "Test connection": nothing is stored. */
  is_test: boolean;
  conversation: {
    id: string;
    channel?: string;
    widget_id?: string;
    language?: string;
    status?: string;
    metadata?: unknown;
    verified_identity?: unknown;
    /** name, email and phone appear only with "include contact details" on. */
    visitor?: { id?: string; name?: string; email?: string; phone?: string };
    summary?: string | null;
  };
  messages: TurnMessage[];
  history: TurnMessage[];
  reply?: { url?: string; typing_url?: string; handoff_url?: string; decline_url?: string };
}

/** What a live-connection hub call answers. The hub does not throw for refusals: check `ok`. */
export interface AgentRuntimeResult {
  ok: boolean;
  /** e.g. `turn_closed`, `turn_superseded`, `handoff_unavailable`, `human_engaged`, `validation_failed`. */
  code?: string | null;
  error?: string | null;
  /** Close reason, on `turn_closed` only. */
  reason?: string | null;
  messageIds?: string[] | null;
  claimed?: boolean | null;
  resent?: boolean | null;
}
