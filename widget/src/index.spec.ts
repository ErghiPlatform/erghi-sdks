import ErghiWidget from './index';
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
      expect(style?.textContent).toContain('left: 20px');
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

      expect(global.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/messages'),
        expect.anything()
      );
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
});
