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
export class ErghiClient extends EventEmitter<WebSocketEvents> {
  private config: Required<ErghiConfig>;
  private httpClient: AxiosInstance;
  private hub?: signalR.HubConnection;
  private visitorId: string;
  
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
   * Connect to the real-time hub. Was a raw `ws` WebSocket speaking a hand-rolled
   * {type, data} envelope directly at /hubs/chat -- that never completes the SignalR
   * negotiate/handshake a real ASP.NET Core SignalR hub requires, so it could not actually
   * receive events from the real backend. Uses the official @microsoft/signalr client instead
   * (same one the widget SDK, Angular SDK, and admin portal already use successfully against
   * this exact hub), with SignalR's own automatic-reconnect in place of the previous
   * hand-rolled exponential backoff.
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
      // stop() resolves once the connection is fully closed, but the public API is
      // fire-and-forget (matching the previous synchronous ws.close() call) -- onclose above
      // still fires 'disconnected' when it actually completes.
      void this.hub.stop();
      this.hub = undefined;
    }
  }

  /**
   * Invoke a hub method. Only the type strings with a real server-side hub method behind them
   * are supported -- unlike the previous raw-WebSocket transport, which would silently accept
   * (and send into the void, since the server never understood the envelope) any arbitrary
   * type string.
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
