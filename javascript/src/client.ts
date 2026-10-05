import axios, { AxiosInstance, AxiosError } from 'axios';
import EventEmitter from 'eventemitter3';
import * as signalR from '@microsoft/signalr';
import {
  ErghiConfig,
  WebSocketEventType,
} from './types';
import {
  ErghiError,
  AuthenticationError,
  ValidationError,
  RateLimitError,
  NetworkError,
  NotFoundError,
} from './errors';
import { AuthResource } from './resources/auth';
import { ChatResource } from './resources/chat';
import { WorkspaceResource } from './resources/workspace';

type WebSocketEvents = {
  [K in WebSocketEventType]: (data?: any) => void;
} & {
  connected: () => void;
  disconnected: () => void;
  error: (error: any) => void;
};

/**
 * Main Erghi SDK Client
 */
interface PageEventTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** The browser's window and document, or undefined under Node (the SDK builds without DOM types). */
function pageEvents():
  | { window: PageEventTarget; document: PageEventTarget & { visibilityState?: string } }
  | undefined {
  const scope = globalThis as {
    window?: PageEventTarget;
    document?: PageEventTarget & { visibilityState?: string };
  };
  return scope.window && scope.document ? { window: scope.window, document: scope.document } : undefined;
}

export class ErghiClient extends EventEmitter<WebSocketEvents> {
  private config: Required<ErghiConfig>;
  private httpClient: AxiosInstance;
  private hub?: signalR.HubConnection;
  private visitorHub?: signalR.HubConnection;
  private visitorId: string;
  // Per-conversation credential the server issues on conversation create. Every visitor-side
  // call (messages, attachments, identity, secure context, the visitor hub) must present it.
  private visitorTokens = new Map<string, string>();
  
  public readonly auth: AuthResource;
  public readonly chat: ChatResource;
  public readonly workspace: WorkspaceResource;

  constructor(config: ErghiConfig = {}) {
    super();
    
    this.config = {
      apiUrl: config.apiUrl || 'http://localhost:5000',
      wsUrl: config.wsUrl || 'ws://localhost:5002',
      apiKey: config.apiKey || '',
      accessToken: config.accessToken || '',
      clientId: config.clientId || '',
      clientSecret: config.clientSecret || '',
      workspaceId: config.workspaceId || '',
      accountId: config.accountId || '',
      timeout: config.timeout || 30000,
      debug: config.debug || false,
    };

    this.visitorId = '';

    // Initialize HTTP client
    this.httpClient = axios.create({
      baseURL: this.config.apiUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor
    this.httpClient.interceptors.request.use(async (config) => {
      if (this.config.clientId && this.config.clientSecret && !this.config.accessToken) {
        try {
          await this.authenticate();
        } catch (err) {
          this.debug('Auto-authentication failed', err);
        }
      }
      if (this.config.apiKey) {
        config.headers['X-API-Key'] = this.config.apiKey;
      }
      if (this.config.accessToken) {
        config.headers['Authorization'] = `Bearer ${this.config.accessToken}`;
      }
      if (this.config.workspaceId) {
        config.headers['X-Workspace-Id'] = this.config.workspaceId;
      }
      if (this.config.accountId) {
        config.headers['X-Account-Id'] = this.config.accountId;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.httpClient.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        return Promise.reject(this.handleError(error));
      }
    );

    // Initialize resource classes
    this.auth = new AuthResource(this);
    this.chat = new ChatResource(this);
    this.workspace = new WorkspaceResource(this);
  }

  /**
   * Authenticate using Client Credentials to obtain a JWT token
   */
  public async authenticate(): Promise<string> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new AuthenticationError('Client ID and Client Secret are required for token exchange');
    }

    try {
      const response = await axios.post(`${this.config.apiUrl}/api/v1/auth/token`, {
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }, {
        headers: { 'Content-Type': 'application/json' }
      });

      const token = response.data.access_token;
      this.setAccessToken(token);
      return token;
    } catch (error: any) {
      throw new AuthenticationError(error.response?.data?.message || 'Failed to authenticate');
    }
  }

  /**
   * Authenticate a visitor using a signed JWT from the customer's backend.
   * @param widgetId The widget ID
   * @param jwtToken The JWT token signed by the workspace's WidgetSecretKey
   * @returns The internal visitorId
   */
  public async authenticateVisitor(widgetId: string, jwtToken: string): Promise<string> {
    try {
      const response = await axios.post(`${this.config.apiUrl}/api/conversations/identity`, {
        widgetId,
        jwtToken
      }, {
        headers: { 'Content-Type': 'application/json' }
      });
      
      this.visitorId = response.data.visitorId || response.data.VisitorId;
      return this.visitorId;
    } catch (error: any) {
      throw new AuthenticationError(error.response?.data?.error || 'Failed to authenticate visitor');
    }
  }

  /**
   * Get the HTTP client instance
   */
  public getHttpClient(): AxiosInstance {
    return this.httpClient;
  }

  /**
   * Set access token
   */
  public setAccessToken(token: string): void {
    this.config.accessToken = token;
  }

  /**
   * Set workspace ID
   */
  public setWorkspaceId(workspaceId: string): void {
    this.config.workspaceId = workspaceId;
  }

  /**
   * Get visitor ID
   */
  public getVisitorId(): string {
    return this.visitorId;
  }

  /**
   * Remember the visitor token for a conversation. `chat.createConversation` does this for you;
   * call it yourself when resuming a conversation whose id and token you persisted.
   */
  public setVisitorToken(conversationId: string, visitorToken: string): void {
    this.visitorTokens.set(conversationId, visitorToken);
  }

  public getVisitorToken(conversationId: string): string | undefined {
    return this.visitorTokens.get(conversationId);
  }

  public clearVisitorToken(conversationId: string): void {
    this.visitorTokens.delete(conversationId);
  }

  /**
   * Connect to a conversation's visitor hub (`/hubs/visitor`) as the end user, authorized by the
   * conversation's visitor token instead of an operator access token. Emits 'message.received'
   * for agent/AI replies, plus 'conversation.closed', 'conversation.assigned',
   * 'conversation.escalated', 'conversation.inactivity_warning' and 'context.required'.
   *
   * Mobile webviews (Capacitor, in-app browsers) suspend the page in the background, and the
   * automatic reconnect gives up while suspended. When the page is visible, online or restored
   * from the back/forward cache again, the hub is restarted if needed and
   * 'conversation.resumed' is emitted: refetch the messages then, since replies sent while
   * suspended never arrived over the socket.
   */
  public async connectVisitor(conversationId: string): Promise<void> {
    const visitorToken = this.visitorTokens.get(conversationId);
    if (!visitorToken) {
      throw new ErghiError(
        'No visitor token for this conversation; create it with chat.createConversation or call setVisitorToken',
        'VISITOR_TOKEN_MISSING'
      );
    }
    await this.disconnectVisitor();

    const base = this.config.apiUrl.replace(/\/$/, '');
    const hub = new signalR.HubConnectionBuilder()
      .withUrl(
        `${base}/hubs/visitor?conversationId=${encodeURIComponent(conversationId)}` +
          `&visitorToken=${encodeURIComponent(visitorToken)}`,
        // The visitor is authorized by the token in the query, not a cookie. The gateway's public
        // CORS policy reflects any origin without Allow-Credentials, so a credentialed handshake
        // (signalr's default) would be blocked in browsers and Capacitor webviews.
        { withCredentials: false }
      )
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .build();

    hub.on('MessageReceived', (data) => this.emit('message.received', data));
    hub.on('ConversationClosed', (data) => this.emit('conversation.closed', data));
    hub.on('ConversationAssigned', (data) => this.emit('conversation.assigned', data));
    hub.on('ConversationEscalated', (data) => this.emit('conversation.escalated', data));
    hub.on('ConversationInactivityWarning', (data) => this.emit('conversation.inactivity_warning', data));
    hub.on('ContextRequired', (data) => this.emit('context.required', { conversationId, ...(data ?? {}) }));
    hub.onreconnecting(() => this.emit('disconnected'));
    hub.onreconnected(() => this.emit('connected'));
    hub.onclose((error) => {
      this.emit('disconnected');
      if (error) this.emit('error', error);
    });

    this.visitorHub = hub;
    await hub.start();
    this.debug('Visitor hub connected');
    this.emit('connected');
    this.watchResume(conversationId);
  }

  private resumeConversationId?: string;
  private resuming = false;

  private readonly onResume = (): void => {
    if (pageEvents()?.document.visibilityState === 'hidden') return;
    void this.resumeVisitor();
  };

  private async resumeVisitor(): Promise<void> {
    const conversationId = this.resumeConversationId;
    const hub = this.visitorHub;
    if (!conversationId || !hub || this.resuming) return;
    this.resuming = true;
    try {
      if (hub.state === signalR.HubConnectionState.Disconnected) {
        await hub.start();
        this.emit('connected');
      }
      this.emit('conversation.resumed', { conversationId });
    } catch (error) {
      this.emit('error', error);
    } finally {
      this.resuming = false;
    }
  }

  private watchResume(conversationId: string): void {
    this.resumeConversationId = conversationId;
    const page = pageEvents();
    if (!page) return;
    page.document.addEventListener('visibilitychange', this.onResume);
    page.window.addEventListener('online', this.onResume);
    page.window.addEventListener('pageshow', this.onResume);
  }

  private unwatchResume(): void {
    this.resumeConversationId = undefined;
    const page = pageEvents();
    if (!page) return;
    page.document.removeEventListener('visibilitychange', this.onResume);
    page.window.removeEventListener('online', this.onResume);
    page.window.removeEventListener('pageshow', this.onResume);
  }

  public async disconnectVisitor(): Promise<void> {
    this.unwatchResume();
    const hub = this.visitorHub;
    this.visitorHub = undefined;
    if (hub) {
      await hub.stop().catch(() => undefined);
    }
  }

  /**
   * Connect to the real-time hub. Uses the official @microsoft/signalr client (the same one
   * the widget SDK, Angular SDK, and admin portal use against this hub), with SignalR's own
   * automatic reconnect.
   */
  public connect(): void {
    if (this.hub && this.hub.state !== signalR.HubConnectionState.Disconnected) {
      return;
    }

    this.hub = new signalR.HubConnectionBuilder()
      .withUrl(`${this.config.wsUrl}/hubs/chat`, {
        accessTokenFactory: () => this.config.accessToken,
        // No explicit WebSocket implementation needed: @microsoft/signalr detects Node at
        // runtime and require()s the `ws` package itself (kept as a dependency for exactly
        // this) when no global `WebSocket` exists; browsers use the native global.
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .build();

    this.hub.on('MessageReceived', (data) => this.emit('message.received', data));
    this.hub.on('MessageRead', (data) => this.emit('message.read', data));
    this.hub.on('UserTyping', (data) => this.emit('user.typing', data));
    this.hub.on('ConversationClosed', (data) => this.emit('conversation.closed', data));
    this.hub.on('ConversationAssigned', (data) => this.emit('conversation.assigned', data));

    this.hub.onreconnecting((error) => {
      this.debug('Hub reconnecting', error);
      this.emit('disconnected');
    });
    this.hub.onreconnected(() => {
      this.debug('Hub reconnected');
      this.emit('connected');
    });
    this.hub.onclose((error) => {
      this.debug('Hub closed', error);
      this.emit('disconnected');
      if (error) {
        this.emit('error', error);
      }
    });

    this.hub
      .start()
      .then(() => {
        this.debug('Hub connected');
        this.emit('connected');
      })
      .catch((error) => {
        this.debug('Hub connection failed', error);
        this.emit('error', error);
      });
  }

  /**
   * Disconnect from the real-time hub.
   */
  public disconnect(): void {
    if (this.hub) {
      // stop() resolves once the connection is fully closed, but the public API here is
      // fire-and-forget -- onclose above still fires 'disconnected' when it actually completes.
      void this.hub.stop();
      this.hub = undefined;
    }
    void this.disconnectVisitor();
  }

  /**
   * Invoke a hub method. Only type strings with a real server-side hub method behind them
   * are supported; anything else throws rather than being sent into the void.
   */
  public send(type: string, data: any): void {
    if (!this.hub || this.hub.state !== signalR.HubConnectionState.Connected) {
      throw new ErghiError('Hub is not connected', 'WS_NOT_CONNECTED');
    }

    switch (type) {
      case 'user.typing':
        void this.hub.invoke('SendTyping', data?.conversationId);
        break;
      default:
        throw new ErghiError(`Unsupported real-time event type: ${type}`, 'UNSUPPORTED_EVENT_TYPE');
    }
  }

  /**
   * Join a conversation's real-time group -- required before UserTyping/MessageRead events
   * for that conversation will be delivered to this connection.
   */
  public joinConversation(conversationId: string): Promise<void> {
    if (!this.hub || this.hub.state !== signalR.HubConnectionState.Connected) {
      throw new ErghiError('Hub is not connected', 'WS_NOT_CONNECTED');
    }
    return this.hub.invoke('JoinConversation', conversationId);
  }

  public leaveConversation(conversationId: string): Promise<void> {
    if (!this.hub || this.hub.state !== signalR.HubConnectionState.Connected) {
      throw new ErghiError('Hub is not connected', 'WS_NOT_CONNECTED');
    }
    return this.hub.invoke('LeaveConversation', conversationId);
  }

  // Inherits typed 'on' from EventEmitter<WebSocketEvents>

  private handleError(error: AxiosError): ErghiError {
    const response = error.response;

    if (!response) {
      return new NetworkError('Network request failed', error.message);
    }

    const data = response.data as any;
    const message = data?.message || error.message;

    switch (response.status) {
      case 400:
        return new ValidationError(message, data?.errors);
      case 401:
        return new AuthenticationError(message);
      case 404:
        return new NotFoundError(message);
      case 429:
        return new RateLimitError(message, parseInt(response.headers['retry-after'] || '60'));
      default:
        return new ErghiError(message, 'API_ERROR', response.status, data);
    }
  }

  private debug(message: string, ...args: any[]): void {
    if (this.config.debug) {
      console.log(`[ErghiSDK] ${message}`, ...args);
    }
  }
}
