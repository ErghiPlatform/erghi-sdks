import { buildStyles, ICON_CHAT, ICON_SEND } from './styles';
import { ConversationRealtimeClient } from './realtime';
import { playMessageNotification } from './notification';

export interface ErghiConfig {
  /** Widget UUID from admin portal */
  widgetId: string;
  /** @deprecated use widgetId */
  workspace?: string;
  apiUrl?: string;
  position?: 'bottom-left' | 'bottom-right';
  primaryColor?: string;
  greeting?: string;
  title?: string;
  autoOpen?: boolean;
  /** Color theme: 'light' (default), 'dark', or 'auto' (follows system preference) */
  theme?: 'light' | 'dark' | 'auto';
  /** Arbitrary visitor / session context passed to the AI (customerId, claims, etc.) */
  visitorContext?: Record<string, unknown>;
}

interface Message {
  id: string;
  content: string;
  sender: string;
  createdAt?: string;
}

export default class ErghiWidget {
  private config: Required<Omit<ErghiConfig, 'workspace' | 'visitorContext'>> & {
    workspace?: string;
    visitorContext: Record<string, unknown>;
  };
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private isOpen = false;
  private conversationId: string | null = null;
  private visitorId: string | null = null;
  private messages: Message[] = [];
  private isTyping = false;
  private knownMessageIds = new Set<string>();
  private realtime = new ConversationRealtimeClient();
  private fallbackPollTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private awaitingReply = false;
  private lastInactivityWarningAt = 0;
  private pendingFile: File | null = null;
  private translations: Record<string, string> = {};
  private locale = 'en';
  private displayConfig = {
    aiAssistantName: 'AI Assistant',
    showAiLabel: true,
    showAgentName: true,
    assignedAgentName: '',
  };

  constructor(config: ErghiConfig) {
    const widgetId = config.widgetId || config.workspace;
    if (!widgetId) throw new Error('Erghi: widgetId is required');

    this.config = {
      widgetId,
      workspace: config.workspace,
      apiUrl: config.apiUrl || 'http://localhost:5080',
      position: config.position || 'bottom-right',
      primaryColor: config.primaryColor || '#0066FF',
      greeting: config.greeting || 'Hi! How can we help you today?',
      title: config.title || 'Erghi',
      autoOpen: config.autoOpen ?? false,
      theme: config.theme ?? 'light',
      visitorContext: { ...(config.visitorContext ?? {}) },
    };

    this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    await Promise.all([this.loadWidgetEmbedConfig(), this.loadTranslations()]);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.render());
    } else {
      this.render();
    }
  }

  private detectLocale(): string {
    try {
      const stored = localStorage.getItem('erghi:locale') || localStorage.getItem('ui-language');
      if (stored) return stored.slice(0, 2);
    } catch { /* ignore */ }
    return (document.documentElement.lang || navigator.language || 'en').slice(0, 2);
  }

  private tr(key: string, fallback: string): string {
    return this.translations[key] || fallback;
  }

  private async loadTranslations(): Promise<void> {
    this.locale = this.detectLocale();
    try {
      const res = await fetch(
        `${this.config.apiUrl}/api/v1/i18n/translations?language=${encodeURIComponent(this.locale)}&context=widget`
      );
      if (res.ok) this.translations = await res.json();
    } catch { /* optional */ }
  }

  private async loadWidgetEmbedConfig(): Promise<void> {
    try {
      const res = await fetch(`${this.config.apiUrl}/api/widgets/${this.config.widgetId}/public`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.primaryColor) this.config.primaryColor = data.primaryColor;
      if (data.welcomeMessage) this.config.greeting = data.welcomeMessage;
      if (data.companyName) this.config.title = data.companyName;
      this.displayConfig = {
        aiAssistantName: data.aiAssistantName ?? data.AiAssistantName ?? 'AI Assistant',
        showAiLabel: data.showAiLabel ?? data.ShowAiLabel ?? true,
        showAgentName: data.showAgentName ?? data.ShowAgentName ?? true,
        assignedAgentName: this.displayConfig.assignedAgentName,
      };
    } catch { /* optional */ }
  }

  /**
   * Set or merge visitor context (customerId, email, JWT claims, custom fields).
   * Call before or after opening the widget; syncs to the server when a conversation exists.
   */
  public identify(context: Record<string, unknown>): void {
    this.setContext(context, true);
  }

  /** Replace or merge visitor context metadata. */
  public setContext(context: Record<string, unknown>, merge = true): void {
    if (merge) {
      this.config.visitorContext = { ...this.config.visitorContext, ...context };
    } else {
      this.config.visitorContext = { ...context };
    }
    if (this.conversationId) {
      void this.syncMetadata();
    }
  }

  /**
   * Authenticate a visitor using a signed JWT from the customer's backend.
   * This links the widget session to an external user ID.
   */
  public async authenticate(jwtToken: string): Promise<void> {
    try {
      const res = await fetch(`${this.config.apiUrl}/api/conversations/identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widgetId: this.config.widgetId,
          jwtToken
        })
      });

      if (!res.ok) throw new Error(`Identity API error: ${res.status}`);
      const data = await res.json();
      
      this.visitorId = data.visitorId ?? data.VisitorId;
      
      // Optionally merge returned email/name into metadata
      if (data.email) this.setContext({ email: data.email }, true);
      if (data.name) this.setContext({ name: data.name }, true);
      
    } catch (err) {
      console.error('[Erghi] Authentication failed:', err);
    }
  }

  public getContext(): Readonly<Record<string, unknown>> {
    return { ...this.config.visitorContext };
  }

  private render(): void {
    if (this.host) return;

    this.host = document.createElement('div');
    this.host.id = 'erghi-widget-root';
    this.shadow = this.host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = buildStyles(this.config.primaryColor, this.config.position);
    this.shadow.appendChild(style);

    const root = document.createElement('div');
    root.className = 'root';
    root.innerHTML = `
      <div class="panel" id="cf-panel" role="dialog" aria-label="Chat">
        <div class="header">
          <div>
            <p class="header-title">${escapeHtml(this.config.title)}</p>
            <p class="header-sub">We typically reply in minutes</p>
          </div>
          <button type="button" class="icon-btn" id="cf-close" aria-label="Close chat">&times;</button>
        </div>
        <div class="messages" id="cf-messages"></div>
        <div class="typing" id="cf-typing"><span></span><span></span><span></span></div>
        <div class="composer">
          <input type="file" id="cf-file" accept="image/*,.pdf,.txt" hidden />
          <button type="button" class="attach-btn" id="cf-attach" aria-label="Attach file">📎</button>
          <input type="text" id="cf-input" placeholder="${escapeHtml(this.tr('widget.input.placeholder', 'Type a message…'))}" autocomplete="off" maxlength="4000" />
          <button type="button" class="send-btn" id="cf-send" aria-label="Send">${ICON_SEND}</button>
        </div>
      </div>
      <button type="button" class="bubble" id="cf-bubble" aria-label="Open chat">${ICON_CHAT}</button>
    `;
    this.shadow.appendChild(root);

    document.body.appendChild(this.host);
    this.bindEvents();
    this.addSystemMessage(this.config.greeting);
    void this.tryRestoreSession();

    if (this.config.autoOpen) this.open();
  }

  private bindEvents(): void {
    const s = this.shadow!;
    s.getElementById('cf-bubble')?.addEventListener('click', () => this.toggle());
    s.getElementById('cf-close')?.addEventListener('click', () => this.close());
    s.getElementById('cf-send')?.addEventListener('click', () => void this.sendMessage());
    s.getElementById('cf-attach')?.addEventListener('click', () => {
      (s.getElementById('cf-file') as HTMLInputElement)?.click();
    });
    s.getElementById('cf-file')?.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      this.pendingFile = input.files?.[0] ?? null;
    });
    s.getElementById('cf-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.sendMessage();
      }
    });
  }

  private $(id: string): HTMLElement | null {
    return this.shadow?.getElementById(id) ?? null;
  }

  public open(): void {
    this.isOpen = true;
    this.$('cf-panel')?.classList.add('open');
    this.$('cf-bubble')?.classList.add('hidden');
    this.$('cf-bubble')?.classList.remove('has-unread');
    void this.ensureConversation();
    (this.$('cf-input') as HTMLInputElement | null)?.focus();
    this.scrollMessages(true);
  }

  private async ensureConversation(): Promise<void> {
    if (this.conversationId) {
      await this.connectRealtime();
      this.startHeartbeat();
      return;
    }
    const restored = await this.tryRestoreSession();
    if (!restored) await this.startConversation();
  }

  public close(): void {
    this.isOpen = false;
    this.$('cf-panel')?.classList.remove('open');
    this.$('cf-bubble')?.classList.remove('hidden');
    this.stopHeartbeat();
    this.stopFallbackPoll();
    // Keep SignalR connected so new replies still arrive (and play notification) while minimized.
  }

  public toggle(): void {
    this.isOpen ? this.close() : this.open();
  }

  public destroy(): void {
    this.stopHeartbeat();
    this.stopFallbackPoll();
    void this.realtime.disconnect();
    this.host?.remove();
    this.host = null;
    this.shadow = null;
  }

  private buildMetadata(): Record<string, unknown> {
    return { ...this.config.visitorContext, locale: this.locale };
  }

  private async syncMetadata(): Promise<void> {
    if (!this.conversationId) return;
    const metadata = this.buildMetadata();
    if (Object.keys(metadata).length === 0) return;

    try {
      await fetch(`${this.config.apiUrl}/api/conversations/${this.conversationId}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata, merge: true }),
      });
    } catch (err) {
      console.warn('[Erghi] Failed to sync visitor context:', err);
    }
  }

  private async startConversation(): Promise<void> {
    try {
      const res = await fetch(`${this.config.apiUrl}/api/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widgetId: this.config.widgetId,
          visitorId: this.visitorId,
          metadata: this.buildMetadata(),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.conversationId = data.id ?? data.Id;
      this.saveSession();
      void this.loadPublicBranding(data.workspaceId ?? data.WorkspaceId);
      void this.connectRealtime();
      this.startHeartbeat();
    } catch (err) {
      console.error('[Erghi] Failed to start conversation:', err);
      this.addSystemMessage('Unable to connect. Please try again.');
    }
  }

  private async sendMessage(): Promise<void> {
    const input = this.$('cf-input') as HTMLInputElement | null;
    const content = input?.value.trim() || (this.pendingFile ? `[${this.pendingFile.name}]` : '');
    if (!content && !this.pendingFile) return;

    if (!this.conversationId) {
      await this.startConversation();
      if (!this.conversationId) return;
    }

    const tempId = `temp-${Date.now()}`;
    this.appendMessageEl({ id: tempId, content: content || `📎 ${this.pendingFile!.name}`, sender: 'visitor' });
    if (input) input.value = '';
    this.setTyping(true);

    try {
      let attachments: Array<{ id: string; filename: string; contentType: string; size: number; url: string }> | undefined;
      if (this.pendingFile) {
        const fd = new FormData();
        fd.append('file', this.pendingFile);
        const up = await fetch(
          `${this.config.apiUrl}/api/conversations/${this.conversationId}/attachments`,
          { method: 'POST', body: fd }
        );
        if (!up.ok) throw new Error(`Upload HTTP ${up.status}`);
        const uploaded = await up.json();
        attachments = [{
          id: uploaded.id ?? uploaded.Id,
          filename: uploaded.filename ?? uploaded.Filename,
          contentType: uploaded.contentType ?? uploaded.ContentType,
          size: uploaded.size ?? uploaded.Size,
          url: uploaded.url ?? uploaded.Url,
        }];
        this.pendingFile = null;
        const fileInput = this.$('cf-file') as HTMLInputElement | null;
        if (fileInput) fileInput.value = '';
      }

      const res = await fetch(
        `${this.config.apiUrl}/api/conversations/${this.conversationId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, type: 'text', attachments }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const saved = await res.json();
      const serverId = saved.id ?? saved.Id;
      this.replaceTempId(tempId, serverId);
      this.knownMessageIds.add(serverId);
      this.awaitReply();
    } catch (err) {
      console.error('[Erghi] Send failed:', err);
      this.setTyping(false);
      this.addSystemMessage('Message failed to send.');
    }
  }

  private replaceTempId(tempId: string, serverId: string): void {
    this.knownMessageIds.delete(tempId);
    this.knownMessageIds.add(serverId);
    const el = this.shadow?.querySelector(`[data-id="${tempId}"]`);
    if (el) el.setAttribute('data-id', serverId);
    const msg = this.messages.find(m => m.id === tempId);
    if (msg) msg.id = serverId;
  }

  private extractMessages(payload: unknown): Message[] {
    if (Array.isArray(payload)) return payload as Message[];
    const obj = payload as Record<string, unknown>;
    const list = obj?.data ?? obj?.Data ?? obj?.items ?? obj?.Items;
    return Array.isArray(list) ? (list as Message[]) : [];
  }

  private awaitReply(): void {
    this.awaitingReply = true;
    this.setTyping(true);
  }

  private async loadPublicBranding(workspaceId: string | undefined): Promise<void> {
    if (!workspaceId) return;
    try {
      const res = await fetch(`${this.config.apiUrl}/api/v1/branding/public/${workspaceId}`);
      if (!res.ok) return;
      const data = await res.json();
      this.displayConfig = {
        aiAssistantName: data.aiAssistantName ?? data.AiAssistantName ?? 'AI Assistant',
        showAiLabel: data.showAiLabel ?? data.ShowAiLabel ?? true,
        showAgentName: data.showAgentName ?? data.ShowAgentName ?? true,
        assignedAgentName: this.displayConfig.assignedAgentName,
      };
    } catch {
      // optional
    }
  }

  private async connectRealtime(): Promise<void> {
    if (!this.conversationId) return;

    try {
      await this.realtime.connect(this.config.apiUrl, this.conversationId, {
        onMessage: (msg) => this.handleInboundMessage(msg),
        onClosed: () => this.handleSessionEnded(),
        onEscalated: (payload) => {
          if (payload.queuePosition > 1) {
            this.addSystemMessage(`You're #${payload.queuePosition} in the queue. An agent will join shortly.`);
          }
        },
        onAssigned: (payload) => {
          this.displayConfig.assignedAgentName = payload.agentName;
          this.addSystemMessage(`You're connected with ${payload.agentName}.`);
          this.awaitingReply = false;
          this.setTyping(false);
        },
        onStateChange: (connected) => {
          if (connected) {
            this.stopFallbackPoll();
          } else {
            this.startFallbackPoll();
          }
        },
        onInactivityWarning: (payload) => {
          const mins = Math.max(1, Math.ceil(payload.secondsUntilClose / 60));
          this.addSystemMessage(
            `This chat will close in about ${mins} minute${mins === 1 ? '' : 's'} due to inactivity. Send a message to stay connected.`
          );
        },
      });
    } catch (err) {
      console.warn('[Erghi] SignalR connect failed, using HTTP fallback:', err);
      this.startFallbackPoll();
    }
  }

  private handleInboundMessage(msg: { id: string; content: string; sender: string }): void {
    const sender = msg.sender.toLowerCase();
    if (sender === 'system') {
      if (this.knownMessageIds.has(msg.id)) return;
      this.knownMessageIds.add(msg.id);
      this.appendMessageEl({ id: msg.id, content: msg.content, sender: 'system' });
      this.awaitingReply = false;
      this.setTyping(false);
      return;
    }
    if (sender === 'visitor' || sender === 'user') {
      this.knownMessageIds.add(msg.id);
      return;
    }
    if (this.knownMessageIds.has(msg.id)) return;
    this.knownMessageIds.add(msg.id);
    this.appendMessageEl({ id: msg.id, content: msg.content, sender: msg.sender });
    this.awaitingReply = false;
    this.setTyping(false);
    if (!this.isOpen) {
      this.$('cf-bubble')?.classList.add('has-unread');
    }
    playMessageNotification();
  }

  private startFallbackPoll(): void {
    if (this.fallbackPollTimer || !this.conversationId) return;
    const poll = async () => {
      if (!this.conversationId || this.realtime.isConnected()) {
        this.stopFallbackPoll();
        return;
      }
      try {
        const res = await fetch(`${this.config.apiUrl}/api/conversations/${this.conversationId}/messages`);
        const list = this.extractMessages(await res.json());
        list.forEach(m => {
          const id = (m as Message & { Id?: string }).id ?? (m as Message & { Id?: string }).Id ?? '';
          const sender = m.sender ?? (m as Message & { Sender?: string }).Sender ?? '';
          const content = m.content ?? (m as Message & { Content?: string }).Content ?? '';
          if (id && !this.knownMessageIds.has(id) && sender !== 'visitor' && sender !== 'user') {
            this.handleInboundMessage({ id, content, sender });
          }
        });
      } catch {
        // retry on next interval
      }
      if (!this.realtime.isConnected() && this.conversationId) {
        this.fallbackPollTimer = setTimeout(poll, 5000);
      }
    };
    void poll();
  }

  private stopFallbackPoll(): void {
    if (this.fallbackPollTimer) {
      clearTimeout(this.fallbackPollTimer);
      this.fallbackPollTimer = null;
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer || !this.conversationId) return;
    const ping = () => void this.sendHeartbeat();
    ping();
    this.heartbeatTimer = setInterval(ping, 60_000);
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.conversationId || !this.isOpen) return;
    try {
      const res = await fetch(
        `${this.config.apiUrl}/api/conversations/${this.conversationId}/heartbeat`,
        { method: 'POST' }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.active === false) {
        this.handleSessionEnded();
        return;
      }
      if (data.inactivityWarning && typeof data.secondsUntilClose === 'number') {
        const now = Date.now();
        if (now - this.lastInactivityWarningAt > 120_000) {
          this.lastInactivityWarningAt = now;
          const mins = Math.max(1, Math.ceil(data.secondsUntilClose / 60));
          this.addSystemMessage(
            `Still there? This chat will close in about ${mins} minute${mins === 1 ? '' : 's'} unless you reply.`
          );
        }
      }
    } catch {
      // retry on next interval
    }
    void this.realtime.ping(this.conversationId);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setTyping(on: boolean): void {
    this.isTyping = on;
    this.$('cf-typing')?.classList.toggle('visible', on);
    this.scrollMessages(true);
  }

  private addSystemMessage(text: string): void {
    this.appendMessageEl({ id: `sys-${Date.now()}`, content: text, sender: 'system' });
  }

  private appendMessageEl(msg: Message): void {
    if (msg.sender !== 'system' && this.messages.some(m => m.id === msg.id)) return;
    if (msg.sender !== 'system') {
      this.messages.push(msg);
      this.knownMessageIds.add(msg.id);
    }

    const box = this.$('cf-messages');
    if (!box) return;

    const el = document.createElement('div');
    const role = msg.sender === 'visitor' || msg.sender === 'user' ? 'visitor'
      : msg.sender === 'bot' ? 'bot'
      : msg.sender === 'system' ? 'system' : 'agent';
    el.className = `msg ${role}`;
    el.setAttribute('data-id', msg.id);

    if (msg.sender !== 'system' && msg.sender !== 'visitor' && msg.sender !== 'user') {
      const label = this.senderLabel(msg.sender);
      if (label) {
        const labelEl = document.createElement('div');
        labelEl.className = 'msg-label';
        labelEl.textContent = label;
        el.appendChild(labelEl);
      }
    }

    const textEl = document.createElement('div');
    textEl.className = 'msg-text';
    textEl.textContent = msg.content;
    el.appendChild(textEl);
    box.appendChild(el);
    this.scrollMessages(true);
  }

  private scrollMessages(force = false): void {
    const box = this.$('cf-messages') as HTMLElement | null;
    if (!box) return;
    const distanceFromBottom = box.scrollHeight - box.scrollTop - box.clientHeight;
    if (!force && distanceFromBottom > 80) return;
    requestAnimationFrame(() => {
      box.scrollTop = box.scrollHeight;
      requestAnimationFrame(() => {
        box.scrollTop = box.scrollHeight;
      });
    });
  }

  private sessionKey(): string {
    return `erghi:session:${this.config.widgetId}`;
  }

  private saveSession(): void {
    if (!this.conversationId) return;
    try {
      localStorage.setItem(this.sessionKey(), JSON.stringify({
        conversationId: this.conversationId,
        savedAt: Date.now(),
      }));
    } catch {
      // private mode / storage full
    }
  }

  private clearSession(): void {
    try {
      localStorage.removeItem(this.sessionKey());
    } catch {
      // ignore
    }
  }

  private handleSessionEnded(): void {
    this.addSystemMessage('This conversation has ended. Start a new chat if you need more help.');
    this.conversationId = null;
    this.clearSession();
    void this.realtime.disconnect();
    this.stopHeartbeat();
  }

  private async tryRestoreSession(): Promise<boolean> {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(this.sessionKey());
    } catch {
      return false;
    }
    if (!raw) return false;

    let conversationId: string;
    try {
      conversationId = JSON.parse(raw).conversationId as string;
    } catch {
      this.clearSession();
      return false;
    }
    if (!conversationId) return false;

    try {
      const convRes = await fetch(`${this.config.apiUrl}/api/conversations/${conversationId}`);
      if (!convRes.ok) {
        this.clearSession();
        return false;
      }
      const conv = await convRes.json();
      const status = String(conv.status ?? conv.Status ?? '').toLowerCase();
      if (status === 'closed' || status === 'resolved') {
        this.clearSession();
        return false;
      }

      this.conversationId = conversationId;
      void this.loadPublicBranding(conv.workspaceId ?? conv.WorkspaceId);
      await this.loadMessageHistory();
      await this.connectRealtime();
      if (this.isOpen) this.startHeartbeat();
      return true;
    } catch {
      return false;
    }
  }

  private async loadMessageHistory(): Promise<void> {
    if (!this.conversationId) return;
    const box = this.$('cf-messages');
    if (box) box.innerHTML = '';
    this.messages = [];
    this.knownMessageIds.clear();

    try {
      const res = await fetch(`${this.config.apiUrl}/api/conversations/${this.conversationId}/messages?limit=200`);
      const list = this.extractMessages(await res.json());
      const sorted = [...list].sort((a, b) => {
        const ta = new Date(a.createdAt ?? (a as Message & { CreatedAt?: string }).CreatedAt ?? 0).getTime();
        const tb = new Date(b.createdAt ?? (b as Message & { CreatedAt?: string }).CreatedAt ?? 0).getTime();
        return ta - tb;
      });
      for (const m of sorted) {
        const id = (m as Message & { Id?: string }).id ?? (m as Message & { Id?: string }).Id ?? '';
        const sender = String(m.sender ?? (m as Message & { Sender?: string }).Sender ?? 'bot').toLowerCase();
        const content = String(m.content ?? (m as Message & { Content?: string }).Content ?? '');
        if (!id || !content) continue;
        this.knownMessageIds.add(id);
        this.appendMessageEl({ id, content, sender });
      }
      if (sorted.length === 0) this.addSystemMessage(this.config.greeting);
      this.scrollMessages(true);
    } catch {
      this.addSystemMessage(this.config.greeting);
    }
  }

  private senderLabel(sender: string): string {
    const s = sender.toLowerCase();
    if (s === 'bot' && this.displayConfig.showAiLabel)
      return this.displayConfig.aiAssistantName;
    if (s === 'agent' && this.displayConfig.showAgentName)
      return this.displayConfig.assignedAgentName || 'Support Agent';
    return '';
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseJsonAttr(raw: string | null): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    console.warn('[Erghi] Invalid JSON in data-visitor-context');
    return undefined;
  }
}

/** Auto-init from script tag attributes */
function autoInit(): void {
  const script =
    document.currentScript as HTMLScriptElement | null ??
    (document.querySelector('script[data-widget-id]') as HTMLScriptElement | null);
  if (!script) return;

  const widgetId = script.getAttribute('data-widget-id') ?? script.getAttribute('data-erghi');
  if (!widgetId) return;

  const visitorContext = parseJsonAttr(script.getAttribute('data-visitor-context'));

  const widget = new ErghiWidget({
    widgetId,
    apiUrl: script.getAttribute('data-api-url') ?? undefined,
    primaryColor: script.getAttribute('data-primary-color') ?? undefined,
    position: (script.getAttribute('data-position') as 'bottom-left' | 'bottom-right') ?? undefined,
    title: script.getAttribute('data-title') ?? undefined,
    greeting: script.getAttribute('data-greeting') ?? undefined,
    visitorContext,
  });

  (window as unknown as { erghiWidget?: ErghiWidget }).erghiWidget = widget;
}

if (typeof window !== 'undefined') {
  (window as unknown as { ErghiWidget: typeof ErghiWidget }).ErghiWidget = ErghiWidget;
  autoInit();
}
