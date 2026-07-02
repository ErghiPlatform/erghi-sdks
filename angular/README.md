# Erghi Angular SDK

Official Angular 19+ SDK for Erghi - Real-time chat with SignalR integration.

## Installation

```bash
npm install @erghi/angular @microsoft/signalr
```

## Setup

### 1. Provide Configuration

```typescript
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ERGHI_CONFIG, authInterceptor, errorInterceptor } from '@erghi/angular';

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(
      withInterceptors([authInterceptor, errorInterceptor])
    ),
    {
      provide: ERGHI_CONFIG,
      useValue: {
        apiUrl: 'http://localhost:5000',
        signalrUrl: 'http://localhost:5002/hubs/chat' // optional
      }
    }
  ]
});
```

## Usage

### Authentication

```typescript
import { Component, inject } from '@angular/core';
import { AuthService } from '@erghi/angular';

@Component({
  selector: 'app-login',
  standalone: true,
  template: `
    <form (ngSubmit)="login()">
      <input [(ngModel)]="email" type="email" placeholder="Email">
      <input [(ngModel)]="password" type="password" placeholder="Password">
      <button type="submit">Login</button>
    </form>
  `
})
export class LoginComponent {
  private authService = inject(AuthService);
  
  email = '';
  password = '';

  login() {
    this.authService.login({ email: this.email, password: this.password })
      .subscribe({
        next: (response) => console.log('Logged in:', response.user),
        error: (error) => console.error('Login failed:', error)
      });
  }
}
```

### Chat Operations

```typescript
import { Component, inject, OnInit } from '@angular/core';
import { ChatService, Message } from '@erghi/angular';

@Component({
  selector: 'app-chat',
  standalone: true,
  template: `
    <div *ngFor="let message of messages">
      {{ message.content }}
    </div>
    <input #input (keyup.enter)="sendMessage(input.value); input.value=''">
  `
})
export class ChatComponent implements OnInit {
  private chatService = inject(ChatService);
  
  messages: Message[] = [];
  conversationId = 'conv-123';

  ngOnInit() {
    this.loadMessages();
  }

  loadMessages() {
    this.chatService.getMessages(this.conversationId)
      .subscribe(response => {
        this.messages = response.data;
      });
  }

  sendMessage(content: string) {
    if (!content.trim()) return;
    
    this.chatService.sendMessage(this.conversationId, content)
      .subscribe(message => {
        this.messages.push(message);
      });
  }
}
```

### Real-time with SignalR

```typescript
import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { SignalRService, Message } from '@erghi/angular';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-realtime-chat',
  standalone: true,
  template: `
    <div [class.connected]="isConnected">
      {{ isConnected ? 'Connected' : 'Disconnected' }}
    </div>
    <div *ngFor="let message of messages">
      {{ message.content }}
    </div>
  `
})
export class RealtimeChatComponent implements OnInit, OnDestroy {
  private signalrService = inject(SignalRService);
  
  messages: Message[] = [];
  isConnected = false;
  conversationId = 'conv-123';
  private subscription?: Subscription;

  async ngOnInit() {
    // Connect to SignalR
    await this.signalrService.connect();
    await this.signalrService.joinConversation(this.conversationId);

    // Listen for connection state
    this.signalrService.connectionState$.subscribe(state => {
      this.isConnected = state === 1; // HubConnectionState.Connected
    });

    // Listen for events
    this.subscription = this.signalrService.events$.subscribe(event => {
      if (event.type === 'message') {
        this.messages.push(event.data as Message);
      } else if (event.type === 'typing') {
        console.log('User typing:', event.data);
      }
    });
  }

  async sendTyping() {
    await this.signalrService.sendTyping(this.conversationId);
  }

  async ngOnDestroy() {
    await this.signalrService.leaveConversation(this.conversationId);
    await this.signalrService.disconnect();
    this.subscription?.unsubscribe();
  }
}
```

### Widget Management

```typescript
import { Component, inject } from '@angular/core';
import { ChatService, Widget } from '@erghi/angular';

@Component({
  selector: 'app-widgets',
  standalone: true,
  template: `
    <div *ngFor="let widget of widgets">
      {{ widget.name }} - {{ widget.slug }}
    </div>
  `
})
export class WidgetsComponent {
  private chatService = inject(ChatService);
  
  widgets: Widget[] = [];
  workspaceId = 'ws-123';

  ngOnInit() {
    this.chatService.getWidgets(this.workspaceId)
      .subscribe(widgets => {
        this.widgets = widgets;
      });
  }

  createWidget() {
    this.chatService.createWidget(
      this.workspaceId,
      'New Widget',
      'new-widget',
      { theme: 'light', primaryColor: '#007bff' }
    ).subscribe(widget => {
      this.widgets.push(widget);
    });
  }
}
```

## API Reference

### AuthService

- `login(credentials: LoginRequest): Observable<AuthResponse>`
- `register(data: RegisterRequest): Observable<AuthResponse>`
- `logout(): Observable<void>`
- `refreshToken(): Observable<AuthResponse>`
- `me(): Observable<User>`
- `currentUser$: Observable<User | null>`
- `isAuthenticated: boolean`
- `getToken(): string | null`

### ChatService

**Conversations:**
- `getConversations(workspaceId, page?, limit?, status?): Observable<PaginatedResponse<Conversation>>`
- `getConversation(id): Observable<Conversation>`
- `createConversation(widgetId, metadata?): Observable<Conversation>`
- `closeConversation(id): Observable<Conversation>`
- `assignConversation(id, agentId): Observable<Conversation>`

**Messages:**
- `getMessages(conversationId, page?, limit?): Observable<PaginatedResponse<Message>>`
- `sendMessage(conversationId, content, type?): Observable<Message>`
- `markAsRead(messageId): Observable<Message>`
- `deleteMessage(messageId): Observable<void>`

**Widgets:**
- `getWidgets(workspaceId): Observable<Widget[]>`
- `getWidget(id): Observable<Widget>`
- `createWidget(workspaceId, name, slug, configuration?): Observable<Widget>`
- `updateWidget(id, data): Observable<Widget>`
- `deleteWidget(id): Observable<void>`

### SignalRService

- `connect(): Promise<void>`
- `disconnect(): Promise<void>`
- `joinConversation(conversationId): Promise<void>`
- `leaveConversation(conversationId): Promise<void>`
- `sendMessage(conversationId, content): Promise<void>`
- `sendTyping(conversationId): Promise<void>`
- `markAsRead(conversationId, messageId): Promise<void>`
- `connectionState$: Observable<HubConnectionState>`
- `events$: Observable<SignalREvent>`

## Testing

Run unit tests:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

## Building

```bash
npm run build
```

Output will be in `dist/` directory.

## License

MIT
