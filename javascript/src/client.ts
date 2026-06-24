import axios, { AxiosInstance, AxiosError } from 'axios';
import EventEmitter from 'eventemitter3';
import WebSocket from 'ws';
import {
  AIChatConfig,
  WebSocketMessage,
  WebSocketEventType,
} from './types';
import {
  AIChatError,
  AuthenticationError,
  ValidationError,
  RateLimitError,
  NetworkError,
  NotFoundError,
} from './errors';
import { AuthResource } from './resources/auth';
import { ChatResource } from './resources/chat';
import { WorkspaceResource } from './resources/workspace';

/**
 * Main AI Chat SDK Client
 */
export class AIChatClient extends EventEmitter {
  private config: Required<AIChatConfig>;
  private httpClient: AxiosInstance;
  private ws?: WebSocket;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  
  public readonly auth: AuthResource;
  public readonly chat: ChatResource;
  public readonly workspace: WorkspaceResource;

  constructor(config: AIChatConfig = {}) {
    super();
    
    this.config = {
      apiUrl: config.apiUrl || 'http://localhost:5000',
      wsUrl: config.wsUrl || 'ws://localhost:5002',
      apiKey: config.apiKey || '',
      accessToken: config.accessToken || '',
      clientId: config.clientId || '',
      clientSecret: config.clientSecret || '',
      workspaceId: config.workspaceId || '',
      timeout: config.timeout || 30000,
      debug: config.debug || false,
    };

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
        config.headers['X-Workspace-ID'] = this.config.workspaceId;
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
   * Connect to WebSocket
   */
  public connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = `${this.config.wsUrl}/hubs/chat?access_token=${this.config.accessToken}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      this.debug('WebSocket connected');
      this.reconnectAttempts = 0;
      this.emit('connected');
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        this.handleWebSocketMessage(message);
      } catch (error) {
        this.debug('Failed to parse WebSocket message', error);
      }
    });

    this.ws.on('close', () => {
      this.debug('WebSocket closed');
      this.emit('disconnected');
      this.reconnect();
    });

    this.ws.on('error', (error) => {
      this.debug('WebSocket error', error);
      this.emit('error', error);
    });
  }

  /**
   * Disconnect from WebSocket
   */
  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
  }

  /**
   * Send message over WebSocket
   */
  public send(type: string, data: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new AIChatError('WebSocket is not connected', 'WS_NOT_CONNECTED');
    }

    const message: WebSocketMessage = { type, data };
    this.ws.send(JSON.stringify(message));
  }

  /**
   * Subscribe to WebSocket events
   */
  public on(event: WebSocketEventType, handler: (data: any) => void): this;
  public on(event: string, handler: (...args: any[]) => void): this {
    return super.on(event, handler);
  }

  private reconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.debug('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    this.debug(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleWebSocketMessage(message: WebSocketMessage): void {
    this.debug('WebSocket message received', message);
    this.emit(message.type, message.data);
  }

  private handleError(error: AxiosError): AIChatError {
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
        return new AIChatError(message, 'API_ERROR', response.status, data);
    }
  }

  private debug(message: string, ...args: any[]): void {
    if (this.config.debug) {
      console.log(`[AIChatSDK] ${message}`, ...args);
    }
  }
}
