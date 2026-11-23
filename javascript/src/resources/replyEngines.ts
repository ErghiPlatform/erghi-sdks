import { ErghiClient } from '../client';
import type {
  AgentReply,
  AgentReplyResult,
  AgentTurn,
  BotMessageResult,
  ListReplyTurnsParams,
  ReplyEngine,
  ReplyEngineHealth,
  ReplyEngineList,
  ReplyEngineName,
  ReplyEngineTestResult,
  ReplyEngineWrite,
  ReplyTurnLogPage,
  SetWidgetReplyEngine,
  WidgetReplyEngine,
} from '../replyEngineTypes';

const BASE = '/api/v1/reply-engines';
const seg = (value: string) => encodeURIComponent(value);

/**
 * Admin side of the reply engine: create and manage the agents that answer a widget's visitors
 * instead of Erghi AI, and choose which one answers which widget.
 *
 * Every call needs `configure_ai` (the names list and reading a widget binding also admit
 * `manage_widgets`). The workspace comes from the credential, never a parameter. Another
 * workspace's id is a plain 404 (`NotFoundError`); 403 and 409 answers throw `ErghiApiError`
 * carrying the platform's machine code in `errorCode` (for example `configure_ai_required`).
 */
export class ReplyEnginesResource {
  constructor(private client: ErghiClient) {}

  private get http() {
    return this.client.getHttpClient();
  }

  /** All engines, the modes the plan allows and (for queue assume-role) Erghi's principal ARN. */
  async list(): Promise<ReplyEngineList> {
    return (await this.http.get<ReplyEngineList>(BASE)).data;
  }

  /** Id, name, mode and status only. */
  async listNames(): Promise<ReplyEngineName[]> {
    return (await this.http.get<ReplyEngineName[]>(BASE, { params: { view: 'names' } })).data;
  }

  async get(engineId: string): Promise<ReplyEngine> {
    return (await this.http.get<ReplyEngine>(`${BASE}/${seg(engineId)}`)).data;
  }

  /** Creates an engine (starts enabled). For Webhook and Queue the response carries the `whsec_` signing secret in `secret`: shown once. */
  async create(engine: ReplyEngineWrite): Promise<ReplyEngine> {
    return (await this.http.post<ReplyEngine>(BASE, engine)).data;
  }

  /** Changes only the fields you set. `mode` cannot change. */
  async update(engineId: string, changes: ReplyEngineWrite): Promise<ReplyEngine> {
    return (await this.http.patch<ReplyEngine>(`${BASE}/${seg(engineId)}`, changes)).data;
  }

  /** Soft-deletes the engine, removes its bindings and closes its open turns. */
  async delete(engineId: string): Promise<void> {
    await this.http.delete(`${BASE}/${seg(engineId)}`);
  }

  async enable(engineId: string): Promise<ReplyEngine> {
    return (await this.http.post<ReplyEngine>(`${BASE}/${seg(engineId)}/enable`)).data;
  }

  /** A disabled engine keeps its bindings but is skipped: Erghi AI answers instead. */
  async disable(engineId: string): Promise<ReplyEngine> {
    return (await this.http.post<ReplyEngine>(`${BASE}/${seg(engineId)}/disable`)).data;
  }

  /** New signing secret (in `secret`, returned once). The previous one keeps signing for 24 hours (`previousSecretExpiresAt`). */
  async rotateSecret(engineId: string): Promise<ReplyEngine> {
    return (await this.http.post<ReplyEngine>(`${BASE}/${seg(engineId)}/rotate-secret`)).data;
  }

  /** Sends a test turn to the saved config; read `ok` / `errorCode` (it does not throw). */
  async test(engineId: string): Promise<ReplyEngineTestResult> {
    return (await this.http.post<ReplyEngineTestResult>(`${BASE}/${seg(engineId)}/test`)).data;
  }

  /** The last 24 hours: counts, p50/p95 first reply and the circuit breaker. */
  async health(engineId: string): Promise<ReplyEngineHealth> {
    return (await this.http.get<ReplyEngineHealth>(`${BASE}/${seg(engineId)}/health`)).data;
  }

  /** Turn log, newest first. Pass the previous page's `nextCursor`; limit up to 100. */
  async listTurns(engineId: string, params: ListReplyTurnsParams = {}): Promise<ReplyTurnLogPage> {
    const query: Record<string, string | number> = {};
    if (params.cursor !== undefined) query.cursor = params.cursor;
    if (params.limit !== undefined) query.limit = params.limit;
    if (params.includeTests) query.includeTests = 'true';
    return (await this.http.get<ReplyTurnLogPage>(`${BASE}/${seg(engineId)}/turns`, { params: query })).data;
  }

  /** Which engine answers the widget (and each of its channels). */
  async getWidgetBinding(widgetId: string): Promise<WidgetReplyEngine> {
    return (await this.http.get<WidgetReplyEngine>(`/api/v1/widgets/${seg(widgetId)}/reply-engine`)).data;
  }

  /** Replaces the widget's bindings. Erghi AI turned off on the widget wins over a binding. */
  async setWidgetBinding(widgetId: string, binding: SetWidgetReplyEngine): Promise<void> {
    await this.http.put(`/api/v1/widgets/${seg(widgetId)}/reply-engine`, {
      default: binding.default ?? null,
      channels: binding.channels ?? null,
    });
  }
}

/**
 * Runtime side of the reply engine, for the code that answers a turn Erghi sent to your agent
 * (webhook, live connection or queue). Needs an API key (`clientId` and `clientSecret`) holding
 * `agent:runtime`; the workspace is the key's. A turn or conversation of another workspace is a
 * 404, never a 403. A turn that already ended answers 409: `ErghiApiError` with `errorCode`
 * `turn_closed` (see `reason`) or `turn_superseded`; stop work on it.
 *
 * Request and response bodies are snake_case, like the platform's runtime API.
 */
export class AgentRuntimeResource {
  constructor(private client: ErghiClient) {}

  private get http() {
    return this.client.getHttpClient();
  }

  private turn(turnId: string) {
    return `/api/v1/agent/turns/${seg(turnId)}`;
  }

  private conversation(conversationId: string) {
    return `/api/v1/agent/conversations/${seg(conversationId)}`;
  }

  async getTurn(turnId: string): Promise<AgentTurn> {
    return (await this.http.get<AgentTurn>(this.turn(turnId))).data;
  }

  /** Posts the reply as bot messages. Safe to retry with the same `idempotency_key`. A reply carrying `handoff` also hands the conversation to a person. */
  async reply(turnId: string, reply: AgentReply): Promise<AgentReplyResult> {
    return (await this.http.post<AgentReplyResult>(`${this.turn(turnId)}/replies`, reply)).data;
  }

  /** Shows the typing indicator for a few seconds; never extends the deadline. */
  async typing(turnId: string): Promise<void> {
    await this.http.post(`${this.turn(turnId)}/typing`);
  }

  /** Gives the conversation to a person. 409 `handoff_unavailable` when the workspace turned handoff off. */
  async handoff(turnId: string, reason?: string): Promise<void> {
    await this.http.post(`${this.turn(turnId)}/handoff`, reason === undefined ? {} : { reason });
  }

  /** Says this agent will not answer, so the engine's fallback applies now, not at the deadline. */
  async decline(turnId: string, reason?: string): Promise<void> {
    await this.http.post(`${this.turn(turnId)}/decline`, reason === undefined ? {} : { reason });
  }

  /** Takes a conversation back from a person (or Erghi AI). 409 `human_engaged` when a teammate already replied (unless `force`), `conversation_closed` when closed. */
  async takeBack(conversationId: string, force = false): Promise<void> {
    await this.http.post(`${this.conversation(conversationId)}/take-back`, { force });
  }

  /** Posts a bot message into a conversation this engine holds, outside any turn. 409 `not_held` otherwise. Idempotent per key. */
  async postBotMessage(conversationId: string, idempotencyKey: string, content: string): Promise<BotMessageResult> {
    return (
      await this.http.post<BotMessageResult>(`${this.conversation(conversationId)}/bot-messages`, {
        idempotency_key: idempotencyKey,
        content,
      })
    ).data;
  }
}
