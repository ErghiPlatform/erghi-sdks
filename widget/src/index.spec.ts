import ErghiWidget, { escapeHtml } from './index';
import { ConversationRealtimeClient } from './realtime';

const getShadowRoot = () => document.getElementById('erghi-widget-root')?.shadowRoot;

// Mock SignalR
jest.mock('@microsoft/signalr', () => ({
  HubConnectionBuilder: jest.fn().mockImplementation(() => ({
    withUrl: jest.fn().mockReturnThis(),
    withAutomaticReconnect: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      off: jest.fn(),
      invoke: jest.fn().mockResolvedValue(undefined),
      onclose: jest.fn(),
      onreconnecting: jest.fn(),
      onreconnected: jest.fn(),
      state: 'Connected',
      serverTimeoutInMilliseconds: 30000,
      keepAliveIntervalInMilliseconds: 15000,
    }),
  })),
  HubConnectionState: {
    Connected: 'Connected',
    Connecting: 'Connecting',
    Disconnected: 'Disconnected',
    Disconnecting: 'Disconnecting',
    Reconnecting: 'Reconnecting',
  },
  HttpTransportType: {
    WebSockets: 1,
    ServerSentEvents: 2,
    LongPolling: 4,
  },
  LogLevel: {
    Information: 1,
  },
}));

// Mock fetch
global.fetch = jest.fn();

describe('ErghiWidget', () => {
  let widget: ErghiWidget;
  const mockConfig = {
    widgetId: 'test-widget-uuid',
    workspace: 'test-workspace-id',
    apiUrl: 'https://api.test.com',
    signalrUrl: 'https://api.test.com/hubs/chat',
  };

  const flushPromises = () => new Promise(resolve => setTimeout(resolve, 10));

  beforeEach(async () => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    localStorage.clear();
    (global.fetch as jest.Mock).mockClear();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'conv-123', messages: [], active: true }),
    });

    widget = new ErghiWidget(mockConfig);
    await flushPromises(); // wait for bootstrap to render
  });

  afterEach(() => {
    if (widget) {
      widget.destroy();
    }
  });

  describe('Initialization', () => {
    it('should create widget with default config', () => {
      expect(widget).toBeInstanceOf(ErghiWidget);
    });

    it('should render bubble and window elements', () => {
      const bubble = getShadowRoot()?.getElementById('cf-bubble');
      const chatWindow = getShadowRoot()?.getElementById('cf-panel');
      
      expect(bubble).toBeTruthy();
      expect(chatWindow).toBeTruthy();
    });

    it('should apply custom primary color', async () => {
      const customWidget = new ErghiWidget({
        ...mockConfig,
        primaryColor: '#ff0000',
      });
      await flushPromises();
      const style = (customWidget as any).shadow?.querySelector('style');
      expect(style?.textContent).toContain('#ff0000');
      customWidget.destroy();
    });

    it('should position bubble based on config', async () => {
      const leftWidget = new ErghiWidget({
        ...mockConfig,
        position: 'bottom-left',
      });
      await flushPromises();
      const style = (leftWidget as any).shadow?.querySelector('style');
      expect(style?.textContent).toContain('left: calc(20px + env(safe-area-inset-left, 0px))');
      leftWidget.destroy();
    });

    it('should auto-open if configured', async () => {
      const autoOpenWidget = new ErghiWidget({
        ...mockConfig,
        autoOpen: true,
      });

      await flushPromises();

      const window = (autoOpenWidget as any).shadow?.getElementById('cf-panel');
      expect(window?.classList.contains('open')).toBe(true);
      
      autoOpenWidget.destroy();
    });
  });

  describe('Window Controls', () => {
    it('should open window when open() is called', () => {
      widget.open();
      const window = getShadowRoot()?.getElementById('cf-panel');
      expect(window?.classList.contains('open')).toBe(true);
    });

    it('should close window when close() is called', () => {
      widget.open();
      widget.close();
      const window = getShadowRoot()?.getElementById('cf-panel');
      expect(window?.classList.contains('open')).toBe(false);
    });

    it('should toggle window state', () => {
      const window = getShadowRoot()?.getElementById('cf-panel');
      widget.toggle();
      expect(window?.classList.contains('open')).toBe(true);
      widget.toggle();
      expect(window?.classList.contains('open')).toBe(false);
    });

    it('should hide bubble when window opens', () => {
      widget.open();
      const bubble = getShadowRoot()?.getElementById('cf-bubble');
      expect(bubble?.classList.contains('hidden')).toBe(true);
    });

    it('should show bubble when window closes', () => {
      widget.open();
      widget.close();
      const bubble = getShadowRoot()?.getElementById('cf-bubble');
      expect(bubble?.classList.contains('hidden')).toBe(false);
    });
  });

  describe('Conversation Handling', () => {
    it('should create conversation on first open', async () => {
      await widget.open();
      await flushPromises();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test.com/api/conversations',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should not create duplicate conversations', async () => {
      await widget.open();
      await flushPromises();
      (global.fetch as jest.Mock).mockClear();
      
      widget.close();
      await widget.open();
      await flushPromises();

      expect(global.fetch).not.toHaveBeenCalledWith(
        'https://api.test.com/api/conversations',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should handle conversation creation error', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await widget.open();
      await flushPromises();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Erghi] Failed to start conversation:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Visitor token (Erghi.Conversation P1-3/P1-4 fix)', () => {
    // POST /api/conversations now returns a per-conversation visitorToken; every subsequent
    // anonymous REST call must send it back as X-Visitor-Token or the server rejects it.
    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'conv-vt-1', visitorToken: 'tok-abc123', messages: [], active: true }),
      });
    });

    it('captures visitorToken from the conversation-create response', async () => {
      await widget.open();
      await flushPromises();

      expect((widget as any).visitorToken).toBe('tok-abc123');
    });

    it('persists visitorToken to localStorage alongside the conversation id', async () => {
      await widget.open();
      await flushPromises();

      const saved = JSON.parse(localStorage.getItem('erghi:session:test-widget-uuid') || '{}');
      expect(saved.conversationId).toBe('conv-vt-1');
      expect(saved.visitorToken).toBe('tok-abc123');
    });

    it('sends the token as X-Visitor-Token on sendMessage', async () => {
      await widget.open();
      await flushPromises();
      (global.fetch as jest.Mock).mockClear();
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ id: 'm1' }) });

      const input = getShadowRoot()?.getElementById('cf-input') as HTMLInputElement;
      const sendButton = getShadowRoot()?.getElementById('cf-send') as HTMLButtonElement;
      input.value = 'hello';
      sendButton.click();
      await flushPromises();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/messages'),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Visitor-Token': 'tok-abc123' }),
        })
      );
    });

    it('sends the token as X-Visitor-Token on the heartbeat call', async () => {
      await widget.open();
      await flushPromises();
      (global.fetch as jest.Mock).mockClear();
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ active: true }) });

      await (widget as any).sendHeartbeat();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/heartbeat'),
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Visitor-Token': 'tok-abc123' }),
        })
      );
    });

    it('sends the token when restoring a saved session', async () => {
      localStorage.setItem(
        'erghi:session:test-widget-uuid',
        JSON.stringify({ conversationId: 'conv-restored', visitorToken: 'tok-restored', savedAt: Date.now() })
      );
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'conv-restored', status: 'open', messages: [] }),
      });

      const restoredWidget = new ErghiWidget(mockConfig);
      await flushPromises();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test.com/api/conversations/conv-restored',
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Visitor-Token': 'tok-restored' }),
        })
      );
      expect((restoredWidget as any).visitorToken).toBe('tok-restored');
      restoredWidget.destroy();
    });

    it('passes the token through to the SignalR connection', async () => {
      const connectSpy = jest.spyOn(ConversationRealtimeClient.prototype, 'connect');

      await widget.open();
      await flushPromises();

      expect(connectSpy).toHaveBeenCalledWith(
        'https://api.test.com',
        'conv-vt-1',
        'tok-abc123',
        expect.anything()
      );
      connectSpy.mockRestore();
    });

    it('omits the header (rather than sending an undefined value) when no token is available', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'conv-no-token', messages: [], active: true }),
      });

      const noTokenWidget = new ErghiWidget(mockConfig);
      await flushPromises();
      await noTokenWidget.open();
      await flushPromises();
      (global.fetch as jest.Mock).mockClear();
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ active: true }) });

      await (noTokenWidget as any).sendHeartbeat();

      const call = (global.fetch as jest.Mock).mock.calls.find((c: unknown[]) =>
        String(c[0]).includes('/heartbeat')
      );
      expect(call?.[1]?.headers ?? {}).not.toHaveProperty('X-Visitor-Token');
      noTokenWidget.destroy();
    });
  });

  describe('Resuming a suspended page (mobile webviews)', () => {
    const setVisibility = (state: 'visible' | 'hidden') =>
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });

    beforeEach(() => {
      (widget as any).conversationId = 'conv-resume';
      setVisibility('visible');
    });

    afterEach(() => setVisibility('visible'));

    it('reconnects when the page becomes visible with the socket down', () => {
      jest.spyOn((widget as any).realtime, 'isConnected').mockReturnValue(false);
      const connect = jest.spyOn(widget as any, 'connectRealtime').mockResolvedValue(undefined);

      document.dispatchEvent(new Event('visibilitychange'));

      expect(connect).toHaveBeenCalledTimes(1);
    });

    it('reconnects when the network comes back', () => {
      jest.spyOn((widget as any).realtime, 'isConnected').mockReturnValue(false);
      const connect = jest.spyOn(widget as any, 'connectRealtime').mockResolvedValue(undefined);

      window.dispatchEvent(new Event('online'));

      expect(connect).toHaveBeenCalledTimes(1);
    });

    it('only fetches missed replies when the socket survived', () => {
      jest.spyOn((widget as any).realtime, 'isConnected').mockReturnValue(true);
      const connect = jest.spyOn(widget as any, 'connectRealtime');
      const fetchMissed = jest.spyOn(widget as any, 'fetchMissedMessages').mockResolvedValue(undefined);

      document.dispatchEvent(new Event('visibilitychange'));

      expect(fetchMissed).toHaveBeenCalledTimes(1);
      expect(connect).not.toHaveBeenCalled();
    });

    it('does nothing while hidden', () => {
      setVisibility('hidden');
      const connect = jest.spyOn(widget as any, 'connectRealtime');

      document.dispatchEvent(new Event('visibilitychange'));

      expect(connect).not.toHaveBeenCalled();
    });

    it('stops listening once destroyed', () => {
      const connect = jest.spyOn(widget as any, 'connectRealtime');
      widget.destroy();

      window.dispatchEvent(new Event('online'));

      expect(connect).not.toHaveBeenCalled();
    });

    it('adds replies that arrived while disconnected, once each', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ items: [
          { id: 'm-missed', sender: 'agent', content: 'Sent while you were away' },
          { id: 'm-own', sender: 'visitor', content: 'mine' },
        ] }),
      });
      const inbound = jest.spyOn(widget as any, 'handleInboundMessage');

      await (widget as any).fetchMissedMessages();

      expect(inbound).toHaveBeenCalledTimes(1);
      expect(inbound).toHaveBeenCalledWith(expect.objectContaining({ id: 'm-missed' }));
    });
  });

  describe('Identity token and secure context', () => {
    const findCall = (fragment: string, method?: string) =>
      (global.fetch as jest.Mock).mock.calls.find((c: unknown[]) =>
        String(c[0]).includes(fragment) && (!method || (c[1] as RequestInit | undefined)?.method === method)
      );

    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'conv-sc-1', visitorToken: 'tok-sc', messages: [], active: true }),
      });
    });

    it('sends identityToken from config when creating the conversation', async () => {
      const w = new ErghiWidget({ ...mockConfig, identityToken: 'jwt-1' });
      await flushPromises();
      await w.open();
      await flushPromises();

      const create = findCall('/api/conversations', 'POST');
      expect(JSON.parse(String(create?.[1]?.body)).identityToken).toBe('jwt-1');
      w.destroy();
    });

    it('starts the conversation without an identity token the server rejects', async () => {
      const ok = { ok: true, status: 200, json: async () => ({ id: 'conv-sc-1', visitorToken: 'tok-sc', messages: [], active: true }) };
      (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (url.endsWith('/api/conversations') && init?.method === 'POST' && body.identityToken) {
          return { ok: false, status: 401, json: async () => ({ error: 'Invalid or expired identity token.' }) };
        }
        return ok;
      });
      const expired = jest.fn();
      window.addEventListener('erghi:identity-expired', expired);
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      const w = new ErghiWidget({ ...mockConfig, identityToken: 'expired-jwt' });
      await flushPromises();
      await w.open();
      await flushPromises();

      const creates = (global.fetch as jest.Mock).mock.calls.filter(
        ([url, init]) => String(url).endsWith('/api/conversations') && init?.method === 'POST');
      expect(creates).toHaveLength(2);
      expect(JSON.parse(String(creates[1][1].body)).identityToken).toBeUndefined();
      expect(expired).toHaveBeenCalledTimes(1);

      window.removeEventListener('erghi:identity-expired', expired);
      warn.mockRestore();
      w.destroy();
    });

    it('posts setIdentityToken to the current conversation with the visitor token', async () => {
      await widget.open();
      await flushPromises();
      (global.fetch as jest.Mock).mockClear();
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });

      await expect(widget.setIdentityToken('jwt-2')).resolves.toBe(true);

      const call = findCall('/conv-sc-1/identity-token', 'POST');
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ identityToken: 'jwt-2' });
      expect(call?.[1]?.headers).toEqual(expect.objectContaining({ 'X-Visitor-Token': 'tok-sc' }));
    });

    it('holds secure context set before the conversation exists, then PUTs it after create', async () => {
      await widget.setSecureContext({ mf_access_token: 'secret-1' }, { ttlSeconds: 900 });
      expect(findCall('/secure-context')).toBeUndefined();

      await widget.open();
      await flushPromises();

      const put = findCall('/conv-sc-1/secure-context', 'PUT');
      expect(JSON.parse(String(put?.[1]?.body))).toEqual({
        values: { mf_access_token: 'secret-1' }, ttlSeconds: 900, merge: true,
      });
    });

    it('never writes secure values to localStorage', async () => {
      await widget.open();
      await flushPromises();
      await widget.setSecureContext({ mf_access_token: 'secret-ls' });

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) as string;
        expect(localStorage.getItem(key)).not.toContain('secret-ls');
      }
    });

    it('asks secureContextProvider before sending when nothing is stored yet, and not again while fresh', async () => {
      const provider = jest.fn().mockResolvedValue({ values: { mf_access_token: 'fresh' }, ttlSeconds: 3600 });
      const w = new ErghiWidget({ ...mockConfig, secureContextProvider: provider });
      await flushPromises();
      await w.open();
      await flushPromises();
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ expiresAt: new Date(Date.now() + 3600_000).toISOString() }),
      });

      const send = async (text: string) => {
        const root = (w as any).shadow as ShadowRoot;
        const input = root?.getElementById('cf-input') as HTMLInputElement;
        input.value = text;
        (root?.getElementById('cf-send') as HTMLButtonElement).click();
        await flushPromises();
      };
      await send('one');
      await send('two');

      expect(provider).toHaveBeenCalledTimes(1);
      expect(findCall('/secure-context', 'PUT')).toBeDefined();
      w.destroy();
    });

    it('refreshes on ContextRequired and emits erghi:context-required', async () => {
      const provider = jest.fn().mockResolvedValue({ values: { mf_access_token: 'renewed' } });
      const w = new ErghiWidget({ ...mockConfig, secureContextProvider: provider });
      await flushPromises();
      await w.open();
      await flushPromises();
      const listener = jest.fn();
      window.addEventListener('erghi:context-required', listener);

      (w as any).handleContextRequired();
      await flushPromises();

      expect(provider).toHaveBeenCalled();
      expect(listener).toHaveBeenCalled();
      window.removeEventListener('erghi:context-required', listener);
      w.destroy();
    });

    it('clearSecureContext sends DELETE', async () => {
      await widget.open();
      await flushPromises();
      await widget.clearSecureContext();

      expect(findCall('/conv-sc-1/secure-context', 'DELETE')).toBeDefined();
    });
  });

  describe('Message Sending', () => {
    beforeEach(async () => {
      widget.open();
      await flushPromises();
    });

    it('should send message via API', async () => {
      const input = getShadowRoot()?.getElementById('cf-input') as HTMLInputElement;
      const sendButton = getShadowRoot()?.getElementById('cf-send') as HTMLButtonElement;
      
      input.value = 'Test message';
      sendButton.click();

      await flushPromises();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/messages'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Test message'),
        })
      );
    });

    it('should clear input after sending', async () => {
      const input = getShadowRoot()?.getElementById('cf-input') as HTMLInputElement;
      const sendButton = getShadowRoot()?.getElementById('cf-send') as HTMLButtonElement;
      
      input.value = 'Test message';
      sendButton.click();

      await flushPromises();
      expect(input.value).toBe('');
    });

    it('should not send empty messages', () => {
      const input = getShadowRoot()?.getElementById('cf-input') as HTMLInputElement;
      const sendButton = getShadowRoot()?.getElementById('cf-send') as HTMLButtonElement;
      
      input.value = '   ';
      sendButton.click();

      const posts = (global.fetch as jest.Mock).mock.calls.filter((c: unknown[]) =>
        String(c[0]).includes('/messages') && (c[1] as RequestInit | undefined)?.method === 'POST');
      expect(posts).toHaveLength(0);
    });

    it('should send message on Enter key', async () => {
      const input = getShadowRoot()?.getElementById('cf-input') as HTMLInputElement;
      input.value = 'Test message';
      
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      input.dispatchEvent(event);

      await flushPromises();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/messages'),
        expect.anything()
      );
    });
  });

  describe('Reply timeout (AC-1)', () => {
    const REPLY_TIMEOUT_MS = 30_000;

    beforeEach(async () => {
      jest.useFakeTimers();
      widget.open();
      await jest.advanceTimersByTimeAsync(0); // let ensureConversation()'s fetch resolve
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const sendTestMessage = async (content: string) => {
      const input = getShadowRoot()?.getElementById('cf-input') as HTMLInputElement;
      const sendButton = getShadowRoot()?.getElementById('cf-send') as HTMLButtonElement;
      input.value = content;
      sendButton.click();
      await jest.advanceTimersByTimeAsync(0); // let the POST /messages fetch resolve
    };

    const errorMessageText = () =>
      Array.from(getShadowRoot()?.querySelectorAll('.msg.system .msg-text') ?? [])
        .map((el) => el.textContent)
        .find((t) => t === "We're having trouble getting a response. Please try again.");

    it('renders a bounded error and clears typing when no reply arrives within 30s', async () => {
      await sendTestMessage('hello');
      expect(getShadowRoot()?.getElementById('cf-typing')?.classList.contains('visible')).toBe(true);
      expect(errorMessageText()).toBeUndefined();

      await jest.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS);

      expect(getShadowRoot()?.getElementById('cf-typing')?.classList.contains('visible')).toBe(false);
      expect(errorMessageText()).toBe("We're having trouble getting a response. Please try again.");
      expect((widget as any).awaitingReply).toBe(false);
    });

    it('cancels the timer and renders no error when a reply arrives first', async () => {
      await sendTestMessage('hello');

      // Advance close to, but not past, the deadline, then simulate the reply landing.
      await jest.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS - 1000);
      (widget as any).handleInboundMessage({ id: 'reply-1', content: 'Here you go', sender: 'bot' });

      // Advance well past the original deadline — no error should ever appear.
      await jest.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS);

      expect(errorMessageText()).toBeUndefined();
      expect(getShadowRoot()?.getElementById('cf-typing')?.classList.contains('visible')).toBe(false);
    });

    it('guards against a reply landing in the same tick the timer fires', async () => {
      await sendTestMessage('hello');

      // Reply arrives, clearing awaitingReply, in the same microtask turn the timer callback runs.
      (widget as any).handleInboundMessage({ id: 'reply-2', content: 'Just in time', sender: 'bot' });
      await jest.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS);

      expect(errorMessageText()).toBeUndefined();
    });

    it('starts a fresh timer and behaves normally for a second message after a timeout', async () => {
      await sendTestMessage('first message');
      await jest.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS);
      expect(errorMessageText()).toBe("We're having trouble getting a response. Please try again.");

      (global.fetch as jest.Mock).mockClear();
      await sendTestMessage('second message');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/messages'),
        expect.objectContaining({ method: 'POST', body: expect.stringContaining('second message') })
      );
      expect(getShadowRoot()?.getElementById('cf-typing')?.classList.contains('visible')).toBe(true);
      expect((widget as any).awaitingReply).toBe(true);

      // The second timer fires independently and the widget is not wedged.
      await jest.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS);
      expect(getShadowRoot()?.getElementById('cf-typing')?.classList.contains('visible')).toBe(false);
    });
  });

  describe('Assistant typing (one reply per turn)', () => {
    const REPLY_TIMEOUT_MS = 30_000;
    const GENERATION_TIMEOUT_MS = 90_000;

    beforeEach(async () => {
      jest.useFakeTimers();
      widget.open();
      await jest.advanceTimersByTimeAsync(0);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const typingVisible = () =>
      getShadowRoot()?.getElementById('cf-typing')?.classList.contains('visible');

    const sendTestMessage = async (content: string) => {
      const input = getShadowRoot()?.getElementById('cf-input') as HTMLInputElement;
      input.value = content;
      (getShadowRoot()?.getElementById('cf-send') as HTMLButtonElement).click();
      await jest.advanceTimersByTimeAsync(0);
    };

    const timedOut = () =>
      Array.from(getShadowRoot()?.querySelectorAll('.msg.system .msg-text') ?? [])
        .some((el) => el.textContent === "We're having trouble getting a response. Please try again.");

    it('gives a generation the server budget instead of the pre-turn timeout', async () => {
      await sendTestMessage('hello');
      await jest.advanceTimersByTimeAsync(3_000);
      (widget as any).handleAssistantTyping(true);

      await jest.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS + 10_000);
      expect(timedOut()).toBe(false);
      expect(typingVisible()).toBe(true);

      await jest.advanceTimersByTimeAsync(GENERATION_TIMEOUT_MS);
      expect(timedOut()).toBe(true);
      expect(typingVisible()).toBe(false);
    });

    it('keeps the indicator on when a generation ends without a reply (superseded by a new message)', async () => {
      await sendTestMessage('first');
      (widget as any).handleAssistantTyping(true);
      await sendTestMessage('second');
      (widget as any).handleAssistantTyping(false);

      expect(typingVisible()).toBe(true);
      expect((widget as any).awaitingReply).toBe(true);

      (widget as any).handleAssistantTyping(true);
      (widget as any).handleInboundMessage({ id: 'turn-reply', content: 'One answer', sender: 'bot' });

      expect(typingVisible()).toBe(false);
      await jest.advanceTimersByTimeAsync(GENERATION_TIMEOUT_MS);
      expect(timedOut()).toBe(false);
    });

    it('shows the indicator for a turn the server starts on its own (e.g. after a reload)', () => {
      (widget as any).handleAssistantTyping(true);
      expect(typingVisible()).toBe(true);
      expect((widget as any).awaitingReply).toBe(true);
    });

    it('a stop with nothing pending hides the indicator', () => {
      (widget as any).setTyping(true);
      (widget as any).handleAssistantTyping(false);
      expect(typingVisible()).toBe(false);
    });
  });

  describe('Message Display', () => {
    it('should display greeting message', async () => {
      const customWidget = new ErghiWidget({
        ...mockConfig,
        greeting: 'Hello there!',
      });
      await flushPromises();
      
      const messagesContainer = (customWidget as any).shadow?.getElementById('cf-messages');
      expect(messagesContainer?.textContent).toContain('Hello there!');
      customWidget.destroy();
    });

    it('should add system message class to greeting', () => {
      const messagesContainer = getShadowRoot()?.getElementById('cf-messages');
      const messageDiv = messagesContainer?.querySelector('.msg.system');
      expect(messageDiv).toBeTruthy();
    });

    it('should handle received messages from SignalR', async () => {
      await widget.open();
      await flushPromises();

      // Mock incoming message
      (widget as any).handleInboundMessage({
        id: 'msg-123',
        content: 'Agent response',
        sender: 'agent'
      });

      const messagesContainer = getShadowRoot()?.getElementById('cf-messages');
      expect(messagesContainer?.textContent).toContain('Agent response');
    });
  });

  describe('Citations', () => {
    it('should render a citation chip for a bot reply with sources', async () => {
      await widget.open();
      await flushPromises();

      (widget as any).handleInboundMessage({
        id: 'msg-cite-1',
        content: 'You can get a refund within 30 days.',
        sender: 'bot',
        sources: [{ url: 'https://example.com/faq', title: 'Refund FAQ' }],
      });

      const messagesContainer = getShadowRoot()?.getElementById('cf-messages');
      const chip = messagesContainer?.querySelector('.msg-source-chip') as HTMLAnchorElement | null;
      expect(chip).toBeTruthy();
      expect(chip?.href).toBe('https://example.com/faq');
      expect(chip?.textContent).toBe('Refund FAQ');
      expect(chip?.target).toBe('_blank');
      expect(chip?.rel).toBe('noopener noreferrer');
    });

    it('should fall back to "Source N" label when a citation has no title', async () => {
      await widget.open();
      await flushPromises();

      (widget as any).handleInboundMessage({
        id: 'msg-cite-2',
        content: 'Here is the policy.',
        sender: 'bot',
        sources: [{ url: 'https://example.com/policy', title: null }],
      });

      const chip = getShadowRoot()?.querySelector('.msg-source-chip');
      expect(chip?.textContent).toBe('Source 1');
    });

    it('should render multiple citation chips for multiple sources', async () => {
      await widget.open();
      await flushPromises();

      (widget as any).handleInboundMessage({
        id: 'msg-cite-3',
        content: 'Combined answer.',
        sender: 'bot',
        sources: [
          { url: 'https://example.com/a', title: 'Doc A' },
          { url: 'https://example.com/b', title: 'Doc B' },
        ],
      });

      const chips = getShadowRoot()?.querySelectorAll('.msg-source-chip');
      expect(chips?.length).toBe(2);
    });

    it('should skip sources with no url', async () => {
      await widget.open();
      await flushPromises();

      (widget as any).handleInboundMessage({
        id: 'msg-cite-4',
        content: 'Answer without a real source.',
        sender: 'bot',
        sources: [{ url: null, title: 'Untitled' }],
      });

      const chips = getShadowRoot()?.querySelectorAll('.msg-source-chip');
      expect(chips?.length).toBe(0);
    });

    it('should not render a sources block when a bot message has no sources', async () => {
      await widget.open();
      await flushPromises();

      (widget as any).handleInboundMessage({
        id: 'msg-cite-5',
        content: 'No citation needed.',
        sender: 'bot',
      });

      const sourcesBlock = getShadowRoot()?.querySelector('.msg-sources');
      expect(sourcesBlock).toBeFalsy();
    });

    it('should render citation chips regardless of sender role (gated on sources, not role)', async () => {
      await widget.open();
      await flushPromises();

      (widget as any).handleInboundMessage({
        id: 'msg-cite-6',
        content: 'A human reply citing a doc',
        sender: 'agent',
        sources: [{ url: 'https://example.com/doc', title: 'Doc' }],
      });

      const chips = getShadowRoot()?.querySelectorAll('.msg-source-chip');
      expect(chips?.length).toBe(1);
    });
  });

  describe('Message Feedback', () => {
    it('should render thumbs up/down buttons on bot messages', async () => {
      await widget.open();
      await flushPromises();

      (widget as any).handleInboundMessage({ id: 'msg-fb-1', content: 'Bot reply', sender: 'bot' });

      const buttons = getShadowRoot()?.querySelectorAll('.msg-feedback-btn');
      expect(buttons?.length).toBe(2);
    });

    it('should not render feedback buttons on agent or visitor messages', async () => {
      await widget.open();
      await flushPromises();

      (widget as any).handleInboundMessage({ id: 'msg-fb-2', content: 'Agent reply', sender: 'agent' });

      const buttons = getShadowRoot()?.querySelectorAll('.msg-feedback-btn');
      expect(buttons?.length).toBe(0);
    });

    it('should POST the rating to the feedback endpoint when thumbs up is clicked', async () => {
      (widget as any).conversationId = 'conv-123';
      await widget.open();
      await flushPromises();
      (global.fetch as jest.Mock).mockClear();
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      (widget as any).handleInboundMessage({ id: 'msg-fb-3', content: 'Bot reply', sender: 'bot' });
      const upBtn = getShadowRoot()?.querySelector('.msg-feedback-btn') as HTMLButtonElement;
      upBtn.click();
      await flushPromises();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/conversations/conv-123/messages/msg-fb-3/feedback'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ rating: 'Up' }),
        })
      );
    });

    it('should disable both buttons and mark the clicked one active after rating', async () => {
      (widget as any).conversationId = 'conv-123';
      await widget.open();
      await flushPromises();
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      (widget as any).handleInboundMessage({ id: 'msg-fb-4', content: 'Bot reply', sender: 'bot' });
      const [upBtn, downBtn] = Array.from(
        getShadowRoot()?.querySelectorAll('.msg-feedback-btn') ?? []
      ) as HTMLButtonElement[];

      downBtn.click();
      await flushPromises();

      expect(downBtn.disabled).toBe(true);
      expect(upBtn.disabled).toBe(true);
      expect(downBtn.classList.contains('active')).toBe(true);
      expect(upBtn.classList.contains('active')).toBe(false);
    });

    it('should not send a second rating once a message has already been rated', async () => {
      (widget as any).conversationId = 'conv-123';
      await widget.open();
      await flushPromises();
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

      (widget as any).handleInboundMessage({ id: 'msg-fb-5', content: 'Bot reply', sender: 'bot' });
      const upBtn = getShadowRoot()?.querySelector('.msg-feedback-btn') as HTMLButtonElement;

      upBtn.click();
      await flushPromises();
      const callsAfterFirstClick = (global.fetch as jest.Mock).mock.calls.length;
      upBtn.click(); // disabled, but simulate a stray event anyway
      await flushPromises();

      expect((global.fetch as jest.Mock).mock.calls.length).toBe(callsAfterFirstClick);
    });
  });

  describe('Localization & RTL', () => {
    it('should default to LTR for English locale', () => {
      const root = getShadowRoot()?.querySelector('.root');
      expect(root?.getAttribute('dir')).toBe('ltr');
    });

    it('should render RTL layout and Arabic strings when locale is Arabic', async () => {
      localStorage.setItem('erghi:locale', 'ar');
      const arWidget = new ErghiWidget(mockConfig);
      await flushPromises();

      const shadow = (arWidget as any).shadow as ShadowRoot;
      const root = shadow.querySelector('.root');
      expect(root?.getAttribute('dir')).toBe('rtl');
      expect(root?.getAttribute('lang')).toBe('ar');

      const input = shadow.getElementById('cf-input') as HTMLInputElement;
      expect(input.placeholder).toBe('اكتب رسالتك…');

      const messages = shadow.getElementById('cf-messages');
      expect(messages?.textContent).toContain('أهلاً');

      arWidget.destroy();
      localStorage.clear();
    });

    it('should honor an explicit direction override', async () => {
      const rtlWidget = new ErghiWidget({ ...mockConfig, direction: 'rtl' });
      await flushPromises();

      const root = (rtlWidget as any).shadow?.querySelector('.root');
      expect(root?.getAttribute('dir')).toBe('rtl');
      rtlWidget.destroy();
    });

    it('should set dir="auto" on each message for mixed-direction threads', async () => {
      await widget.open();
      await flushPromises();

      (widget as any).handleInboundMessage({
        id: 'msg-rtl',
        content: 'مرحبا بك',
        sender: 'agent',
      });

      const textEl = getShadowRoot()?.querySelector('[data-id="msg-rtl"] .msg-text');
      expect(textEl?.getAttribute('dir')).toBe('auto');
    });

    it('should prefer server translations over bundled strings', async () => {
      localStorage.setItem('erghi:locale', 'ar');
      (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
        if (String(url).includes('/api/v1/i18n/translations')) {
          return { ok: true, json: async () => ({ 'widget.greeting': 'أهلاً من السيرفر' }) };
        }
        return { ok: true, json: async () => ({ id: 'conv-123', messages: [], active: true }) };
      });

      const arWidget = new ErghiWidget(mockConfig);
      await flushPromises();

      const messages = ((arWidget as any).shadow as ShadowRoot).getElementById('cf-messages');
      expect(messages?.textContent).toContain('أهلاً من السيرفر');

      arWidget.destroy();
      localStorage.clear();
    });
  });

  describe('Cleanup', () => {
    it('should remove all DOM elements on destroy', () => {
      widget.destroy();
      expect(document.querySelector('#erghi-widget-root')).toBeNull();
    });

    it('should disconnect SignalR on destroy', async () => {
      await widget.open();
      await flushPromises();

      const realtime = (widget as any).realtime as ConversationRealtimeClient;
      const stopSpy = jest.spyOn(realtime, 'disconnect');

      widget.destroy();
      expect(stopSpy).toHaveBeenCalled();
    });
  });

  describe('escapeHtml', () => {
    // 2026-08-08 security-audit regression guard: every current caller interpolates this
    // into double-quoted HTML attribute positions inside a template-literal innerHTML,
    // sourced from remote i18n translation strings -- an unescaped quote lets the rest of
    // the string inject arbitrary attributes/event handlers on every site embedding this
    // widget. Quotes must be encoded, not just &, <, >.
    it('encodes double quotes', () => {
      expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
    });

    it('encodes single quotes', () => {
      expect(escapeHtml("say 'hi'")).toBe('say &#39;hi&#39;');
    });

    it('still encodes ampersands and angle brackets', () => {
      expect(escapeHtml('<script>a&b</script>')).toBe('&lt;script&gt;a&amp;b&lt;/script&gt;');
    });

    it('neutralizes an attribute-breakout payload end to end', () => {
      const payload = `" onmouseover="alert(document.cookie)`;
      const escaped = escapeHtml(payload);
      const rendered = document.createElement('div');
      rendered.innerHTML = `<a aria-label="${escaped}">x</a>`;
      const anchor = rendered.querySelector('a')!;
      // The payload must land entirely inside aria-label -- no onmouseover attribute
      // should exist on the parsed element.
      expect(anchor.getAttribute('onmouseover')).toBeNull();
      expect(anchor.getAttribute('aria-label')).toContain('onmouseover=');
    });
  });
});
