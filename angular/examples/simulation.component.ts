/**
 * ChatFlow Angular SDK — Simulation Component
 *
 * A standalone Angular component that exercises AuthService, ChatService,
 * and SignalRService against http://localhost:5000.
 *
 * Add it to any Angular 17+ app that imports the ChatFlow Angular SDK:
 *
 *   // app.config.ts
 *   import { provideChatFlow } from '@chatflow/angular-sdk';
 *   providers: [provideChatFlow({ apiUrl: 'http://localhost:5000' })]
 *
 * Then use <app-simulation /> in your template.
 */

import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../src/lib/services/auth.service';
import { ChatService } from '../src/lib/services/chat.service';
import { SignalRService } from '../src/lib/services/signalr.service';

interface MessageItem {
  id: string;
  sender: string;
  content: string;
  createdAt: string;
}

@Component({
  selector: 'app-simulation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="simulation-root">
      <!-- Auth Panel -->
      <div *ngIf="!isLoggedIn()" class="auth-panel">
        <h2>ChatFlow Angular SDK Demo</h2>

        <div *ngIf="authMode() === 'register'">
          <input [(ngModel)]="firstName" placeholder="First Name" />
          <input [(ngModel)]="lastName" placeholder="Last Name" />
        </div>

        <input [(ngModel)]="email" type="email" placeholder="Email" />
        <input [(ngModel)]="password" type="password" placeholder="Password" />

        <p *ngIf="error()" class="error">{{ error() }}</p>

        <button (click)="authMode() === 'register' ? register() : login()">
          {{ authMode() === 'register' ? 'Register' : 'Login' }}
        </button>

        <p class="toggle">
          <span *ngIf="authMode() === 'register'">
            Already registered?
            <button class="link" (click)="setAuthMode('login')">Login</button>
          </span>
          <span *ngIf="authMode() === 'login'">
            New here?
            <button class="link" (click)="setAuthMode('register')">Register</button>
          </span>
        </p>
      </div>

      <!-- Chat Panel -->
      <div *ngIf="isLoggedIn()" class="chat-panel">
        <div class="chat-header">
          <span>ChatFlow Demo</span>
          <span class="badge" [class.online]="isConnected()">
            {{ isConnected() ? '● Connected' : '○ Offline' }}
          </span>
        </div>

        <div class="messages" #msgContainer>
          <div
            *ngFor="let msg of messages()"
            class="bubble"
            [class.own]="msg.sender === 'user'"
          >
            <strong>{{ msg.sender }}</strong>
            <p>{{ msg.content }}</p>
            <small>{{ msg.createdAt | date: 'shortTime' }}</small>
          </div>
          <p *ngIf="messages().length === 0" class="hint">No messages yet.</p>
        </div>

        <form class="input-row" (submit)="sendMessage($event)">
          <input
            [(ngModel)]="newMessage"
            name="msg"
            placeholder="Type a message…"
            (input)="onTyping()"
          />
          <button type="submit" [disabled]="!newMessage.trim()">Send</button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .simulation-root {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #f8fafc;
      font-family: system-ui, sans-serif;
    }
    .auth-panel {
      background: #fff;
      padding: 2rem;
      border-radius: 1rem;
      box-shadow: 0 4px 24px rgba(0,0,0,.1);
      width: 360px;
      display: flex;
      flex-direction: column;
      gap: .75rem;
    }
    input {
      padding: .65rem .9rem;
      border-radius: .5rem;
      border: 1px solid #d1d5db;
      font-size: .95rem;
      outline: none;
      width: 100%;
      box-sizing: border-box;
    }
    button {
      padding: .7rem;
      background: #6366f1;
      color: #fff;
      border: none;
      border-radius: .5rem;
      cursor: pointer;
      font-weight: 600;
      font-size: 1rem;
    }
    button:disabled { opacity: .5; cursor: default; }
    .link { background: none; color: #6366f1; padding: 0; font-size: .9rem; }
    .error { color: #ef4444; font-size: .875rem; }
    .toggle { text-align: center; font-size: .875rem; }
    .chat-panel {
      width: 420px;
      height: 600px;
      background: #fff;
      border-radius: 1rem;
      box-shadow: 0 4px 24px rgba(0,0,0,.12);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .chat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: .9rem 1.2rem;
      background: #6366f1;
      color: #fff;
      font-weight: 600;
    }
    .badge { font-size: .75rem; padding: .2rem .6rem; border-radius: 9999px; background: #ef4444; }
    .badge.online { background: #22c55e; }
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: .5rem;
    }
    .bubble {
      max-width: 80%;
      padding: .6rem .9rem;
      border-radius: .75rem;
      background: #f3f4f6;
      font-size: .9rem;
      align-self: flex-start;
    }
    .bubble.own { align-self: flex-end; background: #6366f1; color: #fff; }
    .bubble p { margin: 4px 0 0; }
    .bubble small { opacity: .6; }
    .hint { color: #9ca3af; text-align: center; font-size: .875rem; }
    .input-row { display: flex; gap: .5rem; padding: .75rem; border-top: 1px solid #e5e7eb; }
    .input-row input { flex: 1; margin: 0; }
    .input-row button { padding: 0 1rem; }
  `],
})
export class SimulationComponent implements OnInit, OnDestroy {
  private authSvc = inject(AuthService);
  private chatSvc = inject(ChatService);
  private signalR = inject(SignalRService);
  private destroy$ = new Subject<void>();

  // ── State ────────────────────────────────────────────────────────────────
  readonly isLoggedIn = signal(false);
  readonly isConnected = signal(false);
  readonly messages = signal<MessageItem[]>([]);
  readonly error = signal('');
  readonly authMode = signal<'register' | 'login'>('register');

  email = '';
  password = '';
  firstName = 'Demo';
  lastName = 'User';
  newMessage = '';

  private conversationId = '';
  private typingTimer: any;

  // ── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit() {
    // Subscribe to SignalR messages
    this.signalR.connectionState$
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => this.isConnected.set(state === 'Connected'));

    this.signalR.messages$
      .pipe(takeUntil(this.destroy$))
      .subscribe((msg: any) => {
        if (msg) {
          this.messages.update((prev) => [...prev, msg]);
        }
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.signalR.disconnect();
  }

  // ── Auth ─────────────────────────────────────────────────────────────────

  setAuthMode(mode: 'register' | 'login') {
    this.authMode.set(mode);
    this.error.set('');
  }

  async register() {
    try {
      this.error.set('');
      await this.authSvc.register({
        email: this.email,
        password: this.password,
        firstName: this.firstName,
        lastName: this.lastName,
      }).toPromise();
      this.isLoggedIn.set(true);
      await this.setupChat();
    } catch (e: any) {
      this.error.set(e.message ?? 'Registration failed');
    }
  }

  async login() {
    try {
      this.error.set('');
      await this.authSvc.login({
        email: this.email,
        password: this.password,
      }).toPromise();
      this.isLoggedIn.set(true);
      await this.setupChat();
    } catch (e: any) {
      this.error.set(e.message ?? 'Login failed');
    }
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  private async setupChat() {
    try {
      // Connect to SignalR hub
      await this.signalR.connect();

      // List conversations or create one
      const list = await this.chatSvc.getConversations().toPromise();
      if (list?.data?.length) {
        this.conversationId = list.data[0].id;
      } else {
        const conv = await this.chatSvc.createConversation({
          widgetId: 'demo-widget',
        }).toPromise();
        this.conversationId = conv.id;
      }

      // Join the conversation room via SignalR
      await this.signalR.joinConversation(this.conversationId);

      // Load message history
      const history = await this.chatSvc.getMessages(this.conversationId).toPromise();
      this.messages.set(history?.data ?? []);
    } catch (e: any) {
      console.error('Chat setup error:', e.message);
    }
  }

  async sendMessage(e: Event) {
    e.preventDefault();
    const content = this.newMessage.trim();
    if (!content) return;
    this.newMessage = '';

    try {
      const msg = await this.chatSvc
        .sendMessage(this.conversationId, { content })
        .toPromise();
      this.messages.update((prev) => [...prev, msg]);
    } catch (e: any) {
      console.error('Send failed:', e.message);
    }
  }

  onTyping() {
    this.signalR.sendTyping(this.conversationId, true);
    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => {
      this.signalR.sendTyping(this.conversationId, false);
    }, 1000);
  }
}
