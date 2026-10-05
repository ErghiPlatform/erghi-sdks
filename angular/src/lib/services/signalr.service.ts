import { Injectable, Inject, OnDestroy } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { ERGHI_CONFIG, ErghiConfig } from '../erghi.config';
import { Message } from '../models';
import { AuthService } from './auth.service';
import { ChatService } from './chat.service';

export interface SignalREvent {
  type: 'message' | 'typing' | 'online' | 'offline' | 'read'
    | 'closed' | 'assigned' | 'escalated' | 'inactivity-warning' | 'context-required';
  data: any;
}

@Injectable({
  providedIn: 'root'
})
export class SignalRService implements OnDestroy {
  private hubConnection?: HubConnection;
  private connectionStateSubject = new BehaviorSubject<HubConnectionState>(HubConnectionState.Disconnected);
  private eventsSubject = new Subject<SignalREvent>();
  
  public connectionState$ = this.connectionStateSubject.asObservable();
  public events$ = this.eventsSubject.asObservable();
  
  constructor(
    @Inject(ERGHI_CONFIG) private config: ErghiConfig,
    private authService: AuthService,
    private chatService: ChatService
  ) {}

  async connect(): Promise<void> {
    if (this.hubConnection && this.hubConnection.state === HubConnectionState.Connected) {
      return;
    }

    const token = this.authService.getToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    const signalrUrl = this.config.signalrUrl || `${this.config.apiUrl}/hubs/chat`;

    this.hubConnection = new HubConnectionBuilder()
      .withUrl(signalrUrl, {
        accessTokenFactory: () => token
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Information)
      .build();

    this.setupEventHandlers();

    try {
      await this.hubConnection.start();
      this.connectionStateSubject.next(HubConnectionState.Connected);
      console.log('SignalR Connected');
    } catch (error) {
      console.error('SignalR Connection Error:', error);
      this.connectionStateSubject.next(HubConnectionState.Disconnected);
      throw error;
    }
  }

  /**
   * Connect as the end user to one conversation's visitor hub (`/hubs/visitor`), authorized by
   * the conversation's visitor token (from ChatService.createConversation or setVisitorToken)
   * instead of an access token. Emits 'message' for agent/AI replies, plus 'closed', 'assigned',
   * 'escalated', 'inactivity-warning' and 'context-required'.
   */
  async connectVisitor(conversationId: string): Promise<void> {
    const visitorToken = this.chatService.getVisitorToken(conversationId);
    if (!visitorToken) {
      throw new Error('No visitor token for this conversation; create it with ChatService.createConversation or call setVisitorToken');
    }
    await this.disconnect();

    const base = this.config.apiUrl.replace(/\/$/, '');
    this.hubConnection = new HubConnectionBuilder()
      .withUrl(
        `${base}/hubs/visitor?conversationId=${encodeURIComponent(conversationId)}` +
          `&visitorToken=${encodeURIComponent(visitorToken)}`,
        // Authorized by the token in the query, not a cookie. The gateway's public CORS policy
        // reflects any origin without Allow-Credentials, so signalr's default credentialed
        // handshake would be blocked in browsers and Capacitor webviews.
        { withCredentials: false }
      )
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    this.setupEventHandlers();
    this.hubConnection.on('ContextRequired', () =>
      this.eventsSubject.next({ type: 'context-required', data: { conversationId } }));

    try {
      await this.hubConnection.start();
      this.connectionStateSubject.next(HubConnectionState.Connected);
    } catch (error) {
      this.connectionStateSubject.next(HubConnectionState.Disconnected);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.hubConnection) {
      await this.hubConnection.stop();
      this.connectionStateSubject.next(HubConnectionState.Disconnected);
      console.log('SignalR Disconnected');
    }
  }

  private setupEventHandlers(): void {
    if (!this.hubConnection) return;

    // Message received (the server's event is MessageReceived on both hubs)
    this.hubConnection.on('MessageReceived', (message: Message) => {
      this.eventsSubject.next({ type: 'message', data: message });
    });

    this.hubConnection.on('ConversationClosed', (data: unknown) => {
      this.eventsSubject.next({ type: 'closed', data });
    });

    this.hubConnection.on('ConversationAssigned', (data: unknown) => {
      this.eventsSubject.next({ type: 'assigned', data });
    });

    this.hubConnection.on('ConversationEscalated', (data: unknown) => {
      this.eventsSubject.next({ type: 'escalated', data });
    });

    this.hubConnection.on('ConversationInactivityWarning', (data: unknown) => {
      this.eventsSubject.next({ type: 'inactivity-warning', data });
    });

    // User typing
    this.hubConnection.on('UserTyping', (data: { conversationId: string; userId: string }) => {
      this.eventsSubject.next({ type: 'typing', data });
    });

    // User online
    this.hubConnection.on('UserOnline', (data: { userId: string }) => {
      this.eventsSubject.next({ type: 'online', data });
    });

    // User offline
    this.hubConnection.on('UserOffline', (data: { userId: string }) => {
      this.eventsSubject.next({ type: 'offline', data });
    });

    // Message read
    this.hubConnection.on('MessageRead', (data: { messageId: string; conversationId: string }) => {
      this.eventsSubject.next({ type: 'read', data });
    });

    // Connection state changes
    this.hubConnection.onreconnecting(() => {
      this.connectionStateSubject.next(HubConnectionState.Reconnecting);
      console.log('SignalR Reconnecting...');
    });

    this.hubConnection.onreconnected(() => {
      this.connectionStateSubject.next(HubConnectionState.Connected);
      console.log('SignalR Reconnected');
    });

    this.hubConnection.onclose(() => {
      this.connectionStateSubject.next(HubConnectionState.Disconnected);
      console.log('SignalR Connection Closed');
    });
  }

  // Hub Methods
  async joinConversation(conversationId: string): Promise<void> {
    if (this.hubConnection?.state === HubConnectionState.Connected) {
      await this.hubConnection.invoke('JoinConversation', conversationId);
    }
  }

  async leaveConversation(conversationId: string): Promise<void> {
    if (this.hubConnection?.state === HubConnectionState.Connected) {
      await this.hubConnection.invoke('LeaveConversation', conversationId);
    }
  }

  async sendMessage(conversationId: string, content: string): Promise<void> {
    if (this.hubConnection?.state === HubConnectionState.Connected) {
      await this.hubConnection.invoke('SendMessage', conversationId, content);
    }
  }

  async sendTyping(conversationId: string): Promise<void> {
    if (this.hubConnection?.state === HubConnectionState.Connected) {
      await this.hubConnection.invoke('SendTyping', conversationId);
    }
  }

  async markAsRead(conversationId: string, messageId: string): Promise<void> {
    if (this.hubConnection?.state === HubConnectionState.Connected) {
      await this.hubConnection.invoke('MarkAsRead', conversationId, messageId);
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
