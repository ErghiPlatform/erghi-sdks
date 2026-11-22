/**
 * Live-connection client for a reply engine in `LiveConnection` mode: a SignalR connection to
 * `/hubs/agent-runtime?engineId=...` on which Erghi pushes turns and your agent answers.
 *
 * Reconnects automatically, forever, until you call `stop()`. After every reconnect it calls the
 * hub's `Resume(lastSequence)` so turns that were requested while you were offline (and are still
 * open) are pushed again. Turns are de-duplicated by id, so a redelivery never reaches your handler
 * twice. Hub calls do not throw for refusals: they resolve to an `AgentRuntimeResult` with
 * `ok: false` and a `code` (`turn_closed`, `turn_superseded`...). Check `ok`.
 *
 * Needs an API key (clientId + clientSecret) holding `agent:runtime`; the workspace is the key's.
 * The token is sent as a query string by SignalR's WebSocket transport, as for every SignalR
 * client; this SDK never logs it.
 */
import axios from 'axios';
import EventEmitter from 'eventemitter3';
import * as signalR from '@microsoft/signalr';
import { AuthenticationError } from './errors';
import type { AgentReply, AgentRuntimeResult, TurnRequest } from './replyEngineTypes';

/** The slice of `signalR.HubConnection` this client uses; a fake can stand in for tests. */
export interface AgentRuntimeConnection {
  start(): Promise<void>;
  stop(): Promise<void>;
  invoke<T = unknown>(methodName: string, ...args: unknown[]): Promise<T>;
  on(methodName: string, handler: (...args: any[]) => void): void;
  onreconnecting(handler: (error?: Error) => void): void;
  onreconnected(handler: (connectionId?: string) => void): void;
  onclose(handler: (error?: Error) => void): void;
}

export interface AgentRuntimeOptions {
  /** API base URL (the gateway), e.g. `https://api.erghi.ai`. */
  apiUrl: string;
  /** The Live connection engine's id. */
  engineId: string;
  /** Returns a bearer token for the hub; called on every (re)connect. Use `clientCredentialsTokenFactory`. */
  accessTokenFactory: () => string | Promise<string>;
  /** Resume from this sequence at start (persist `lastSequence` between runs). Default 0 = none. */
  lastSequence?: number;
  /** Delay before reconnect attempt n (0-based), in ms. Default 0, 2s, 5s, 10s, then 30s forever. */
  reconnectDelaysMs?: number[];
  /** Test seam: replaces the real SignalR connection. */
  connectionFactory?: (url: string, accessTokenFactory: () => string | Promise<string>) => AgentRuntimeConnection;
}

type Events = {
  /** A turn to answer (once per turn id). Answer before `deadline_at`. */
  turnRequested: (turn: TurnRequest) => void;
  /** Another connection of the same engine took the turn. */
  turnClaimed: (turnId: string) => void;
  /** The server closed a turn (deadline, superseded...). Payload as the server sends it. */
  turnClosed: (payload: unknown) => void;
  /** Resume finished after a (re)connect. */
  resumed: (result: AgentRuntimeResult) => void;
  reconnecting: (error?: Error) => void;
  /** The connection ended (after `stop()`, or a fatal server abort). */
  closed: (error?: Error) => void;
  error: (error: unknown) => void;
};

const DEFAULT_DELAYS = [0, 2000, 5000, 10000, 30000];
const MAX_REMEMBERED_TURNS = 2000;

/** Token source for the hub: exchanges client credentials and caches the token until 60 s before expiry. */
export function clientCredentialsTokenFactory(
  apiUrl: string,
  clientId: string,
  clientSecret: string
): () => Promise<string> {
  let token = '';
  let expiresAt = 0;
  return async () => {
    if (token && Date.now() < expiresAt) return token;
    try {
      const response = await axios.post(`${apiUrl.replace(/\/$/, '')}/api/v1/auth/token`, {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      });
      token = response.data.access_token as string;
      const lifetime = Number(response.data.expires_in) || 3600;
      expiresAt = Date.now() + Math.max(0, lifetime - 60) * 1000;
      return token;
    } catch (error: any) {
      throw new AuthenticationError(error.response?.data?.message || 'Failed to authenticate');
    }
  };
}

export class AgentRuntimeClient extends EventEmitter<Events> {
  private readonly connection: AgentRuntimeConnection;
  private readonly seen = new Set<string>();
  private highestSequence: number;
  private started = false;

  constructor(options: AgentRuntimeOptions) {
    super();
    if (!options.apiUrl) throw new Error('apiUrl is required');
    if (!options.engineId) throw new Error('engineId is required');
    if (!options.accessTokenFactory) throw new Error('accessTokenFactory is required');
    this.highestSequence = options.lastSequence ?? 0;

    const url = `${options.apiUrl.replace(/\/$/, '')}/hubs/agent-runtime?engineId=${encodeURIComponent(options.engineId)}`;
    const delays = options.reconnectDelaysMs?.length ? options.reconnectDelaysMs : DEFAULT_DELAYS;
    this.connection = options.connectionFactory
      ? options.connectionFactory(url, options.accessTokenFactory)
      : new signalR.HubConnectionBuilder()
          .withUrl(url, { accessTokenFactory: options.accessTokenFactory })
          // Never give up (null would stop retrying); stop() ends it.
          .withAutomaticReconnect({
            nextRetryDelayInMilliseconds: (ctx) => delays[Math.min(ctx.previousRetryCount, delays.length - 1)],
          })
          // Information (the default) logs the WebSocket URL, token included.
          .configureLogging(signalR.LogLevel.Warning)
          .build();

    this.connection.on('TurnRequested', (turn: TurnRequest) => this.onTurn(turn));
    this.connection.on('TurnClaimed', (turnId: string) => this.emit('turnClaimed', turnId));
    this.connection.on('TurnClosed', (payload: unknown) => this.emit('turnClosed', payload));
    this.connection.onreconnecting((error) => this.emit('reconnecting', error));
    this.connection.onreconnected(() => void this.resume());
    this.connection.onclose((error) => this.emit('closed', error));
  }

  /** The highest turn sequence seen; persist it and pass it as `lastSequence` next run. */
  get lastSequence(): number {
    return this.highestSequence;
  }

  /** Connects, then resumes from `lastSequence` if one was given or seen. */
  async start(): Promise<void> {
    if (this.started) return;
    await this.connection.start();
    this.started = true;
    if (this.highestSequence > 0) await this.resume();
  }

  async stop(): Promise<void> {
    this.started = false;
    await this.connection.stop();
  }

  /** Confirms you got the turn (the engine's deadline keeps running). */
  ack(turnId: string): Promise<AgentRuntimeResult> {
    return this.connection.invoke('Ack', turnId);
  }

  /** Shows the typing indicator for a few seconds. */
  typing(turnId: string): Promise<AgentRuntimeResult> {
    return this.connection.invoke('Typing', turnId);
  }

  /** Streams part of the answer; `streamId` groups the deltas of one answer. */
  replyDelta(turnId: string, streamId: string, delta: string): Promise<AgentRuntimeResult> {
    return this.connection.invoke('ReplyDelta', turnId, streamId, delta);
  }

  /** Posts the final answer (the `AgentReply` body, snake_case like the REST call). Idempotent per `idempotency_key`. */
  replyComplete(turnId: string, reply: AgentReply, streamId?: string): Promise<AgentRuntimeResult> {
    return streamId === undefined
      ? this.connection.invoke('ReplyComplete', turnId, reply)
      : this.connection.invoke('ReplyComplete', turnId, reply, streamId);
  }

  handoff(turnId: string, reason?: string): Promise<AgentRuntimeResult> {
    return this.connection.invoke('Handoff', turnId, reason ?? null);
  }

  decline(turnId: string, reason?: string): Promise<AgentRuntimeResult> {
    return this.connection.invoke('Decline', turnId, reason ?? null);
  }

  takeBack(conversationId: string, force = false): Promise<AgentRuntimeResult> {
    return this.connection.invoke('TakeBack', conversationId, force);
  }

  /** Re-requests open turns with a sequence above `lastSequence` (at most 100). Called for you on reconnect. */
  resumeFrom(lastSequence: number): Promise<AgentRuntimeResult> {
    return this.connection.invoke('Resume', lastSequence);
  }

  private async resume(): Promise<void> {
    try {
      this.emit('resumed', await this.resumeFrom(this.highestSequence));
    } catch (error) {
      this.emit('error', error);
    }
  }

  private onTurn(turn: TurnRequest): void {
    if (!turn || !turn.turn_id) return;
    if (typeof turn.sequence === 'number' && turn.sequence > this.highestSequence) {
      this.highestSequence = turn.sequence;
    }
    if (this.seen.has(turn.turn_id)) return;
    this.seen.add(turn.turn_id);
    if (this.seen.size > MAX_REMEMBERED_TURNS) {
      this.seen.delete(this.seen.values().next().value as string);
    }
    this.emit('turnRequested', turn);
  }
}
