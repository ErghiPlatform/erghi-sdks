import ErghiWidget, { formatReopening, parseOpeningHours } from './index';
import { ConversationRealtimeClient, RealtimeHandlers } from './realtime';

jest.mock('@microsoft/signalr', () => ({
  HubConnectionBuilder: jest.fn().mockImplementation(() => ({
    withUrl: jest.fn().mockReturnThis(),
    withAutomaticReconnect: jest.fn().mockReturnThis(),
    configureLogging: jest.fn().mockReturnThis(),
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
    }),
  })),
  HubConnectionState: { Connected: 'Connected', Disconnected: 'Disconnected' },
  HttpTransportType: { WebSockets: 1, ServerSentEvents: 2, LongPolling: 4 },
  LogLevel: { Information: 1, Warning: 3 },
}));

const API = 'https://api.test.com';
const REPLY_TIMEOUT_MS = 30_000;
const TIMEOUT_TEXT = "We're having trouble getting a response. Please try again.";

interface Served {
  /** The /public response: an object is a 200 body, a number is an error status. */
  publicConfig?: Record<string, unknown> | number;
  /** The GET /api/conversations/{id} body, for a restored session. */
  conversation?: Record<string, unknown>;
}

function serve({ publicConfig = {}, conversation }: Served = {}): jest.Mock {
  const mock = jest.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/public')) {
      return typeof publicConfig === 'number'
        ? { ok: false, status: publicConfig, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => publicConfig };
    }
    if (init?.method === 'POST' && u.endsWith('/messages')) {
      return { ok: true, status: 200, json: async () => ({ id: `m-${Math.random()}` }) };
    }
    if (init?.method === 'POST' && u.endsWith('/api/conversations')) {
      return { ok: true, status: 200, json: async () => ({ id: 'conv-new', visitorToken: 'vt' }) };
    }
    if (conversation && /\/api\/conversations\/[^/]+$/.test(u)) {
      return { ok: true, status: 200, json: async () => conversation };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

const shadow = () => document.getElementById('erghi-widget-root')?.shadowRoot ?? null;
const systemTexts = () =>
  Array.from(shadow()?.querySelectorAll('.msg.system .msg-text') ?? []).map((el) => el.textContent);
const typingVisible = () => shadow()?.getElementById('cf-typing')?.classList.contains('visible') ?? false;

async function mount(): Promise<ErghiWidget> {
  const widget = new ErghiWidget({ widgetId: 'w-1', apiUrl: API });
  await jest.advanceTimersByTimeAsync(0);
  return widget;
}

async function send(text: string): Promise<void> {
  const input = shadow()!.getElementById('cf-input') as HTMLInputElement;
  input.value = text;
  (shadow()!.getElementById('cf-send') as HTMLButtonElement).click();
  await jest.advanceTimersByTimeAsync(0);
}

let widget: ErghiWidget | null = null;

beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  jest.spyOn(ConversationRealtimeClient.prototype, 'connect').mockResolvedValue(undefined);
});

afterEach(async () => {
  await widget?.destroy();
  widget = null;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('an inactive or unknown widget', () => {
  it('shows no launcher when the API says the widget does not exist or is inactive', async () => {
    serve({ publicConfig: 404 });
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    widget = await mount();

    expect(document.getElementById('erghi-widget-root')).toBeNull();
    widget.open();
    await jest.advanceTimersByTimeAsync(0);
    expect(document.getElementById('erghi-widget-root')).toBeNull();
  });

  it.each([500, 503, 0])('still shows the launcher when the config fetch fails with %s', async (status) => {
    serve({ publicConfig: status });
    widget = await mount();

    expect(shadow()?.getElementById('cf-bubble')).toBeTruthy();
  });
});

describe('no false "trouble getting a response" while a person handles the chat', () => {
  const capture = (): { handlers: () => RealtimeHandlers } => {
    let captured: RealtimeHandlers | undefined;
    jest.spyOn(ConversationRealtimeClient.prototype, 'connect')
      .mockImplementation(async (_url, _id, _token, handlers) => { captured = handlers; });
    return { handlers: () => captured as RealtimeHandlers };
  };

  it('stops the reply timer once the conversation is queued, and arms none for later messages', async () => {
    serve();
    const rt = capture();
    widget = await mount();
    widget.open();
    await send('I need a person');
    expect(typingVisible()).toBe(true);

    rt.handlers().onEscalated?.({ queuePosition: 2 });
    expect(typingVisible()).toBe(false);
    await send('are you there?');
    expect(typingVisible()).toBe(false);
    await jest.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS * 4);

    expect(systemTexts()).not.toContain(TIMEOUT_TEXT);
  });

  it('arms no reply timer after an agent is assigned', async () => {
    serve();
    const rt = capture();
    widget = await mount();
    widget.open();
    await send('hello');
    rt.handlers().onAssigned?.({ agentName: 'Sara' });

    await send('thanks Sara');
    await jest.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS * 4);

    expect(systemTexts()).not.toContain(TIMEOUT_TEXT);
  });

  it.each(['Queued', 'Assigned'])('arms no reply timer in a restored %s conversation', async (status) => {
    serve({ conversation: { id: 'conv-1', status, workspaceId: 'ws-1' } });
    localStorage.setItem('erghi:session:w-1', JSON.stringify({ conversationId: 'conv-1', visitorToken: 'vt' }));
    widget = await mount();
    await jest.advanceTimersByTimeAsync(0);
    expect((widget as unknown as { conversationId: string | null }).conversationId).toBe('conv-1');

    widget.open();
    await send('still waiting');
    await jest.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS * 4);

    expect(typingVisible()).toBe(false);
    expect(systemTexts()).not.toContain(TIMEOUT_TEXT);
  });

  it('arms no reply timer when the widget has AI turned off', async () => {
    serve({ publicConfig: { enableAI: false } });
    widget = await mount();
    widget.open();
    await send('hello');
    await jest.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS * 4);

    expect(typingVisible()).toBe(false);
    expect(systemTexts()).not.toContain(TIMEOUT_TEXT);
  });

  it('still reports a stalled AI reply in an AI-handled conversation', async () => {
    serve();
    widget = await mount();
    widget.open();
    await send('hello');
    await jest.advanceTimersByTimeAsync(REPLY_TIMEOUT_MS);

    expect(systemTexts()).toContain(TIMEOUT_TEXT);
  });
});

describe('opening hours', () => {
  const notice = () => shadow()?.getElementById('cf-away') as HTMLElement | null;
  const subtitle = () => shadow()?.getElementById('cf-header-sub')?.textContent;

  it('says the team is away, when it is back, and that the AI can still help', async () => {
    jest.setSystemTime(new Date('2026-01-17T12:00:00Z'));
    serve({ publicConfig: { businessHours: { isOpen: false, nextOpenAt: '2026-01-19T08:00:00Z', timeZone: 'Europe/Berlin' } } });
    widget = await mount();

    expect(subtitle()).toBe('Our team is offline right now.');
    expect(notice()?.hidden).toBe(false);
    expect(notice()?.textContent).toBe(
      `We're back ${formatReopening(Date.parse('2026-01-19T08:00:00Z'), 'en')}. The AI assistant can still help.`);
  });

  it('asks for a message instead when the AI is off, and leaves out an unknown reopening', async () => {
    serve({ publicConfig: { enableAI: false, businessHours: { isOpen: false, nextOpenAt: null, timeZone: 'UTC' } } });
    widget = await mount();

    expect(notice()?.textContent).toBe("Leave a message and we'll reply when we're back.");
  });

  it('shows nothing extra while open or when no hours are set', async () => {
    serve({ publicConfig: { businessHours: { isOpen: true, nextOpenAt: null, timeZone: 'UTC' } } });
    widget = await mount();

    expect(subtitle()).toBe('We typically reply in minutes');
    expect(notice()?.hidden).toBe(true);
  });

  it('switches back to open at the reopening time', async () => {
    jest.setSystemTime(new Date('2026-01-19T07:59:00Z'));
    serve({ publicConfig: { businessHours: { isOpen: false, nextOpenAt: '2026-01-19T08:00:00Z', timeZone: 'UTC' } } });
    widget = await mount();
    expect(notice()?.hidden).toBe(false);

    await jest.advanceTimersByTimeAsync(61_000);

    expect(notice()?.hidden).toBe(true);
    expect(subtitle()).toBe('We typically reply in minutes');
  });
});

describe('parseOpeningHours', () => {
  it('reads both casings, and a stamp without a zone as UTC', () => {
    expect(parseOpeningHours({ IsOpen: false, NextOpenAt: '2026-01-19T08:00:00' }))
      .toEqual({ isOpen: false, nextOpenAt: Date.parse('2026-01-19T08:00:00Z') });
    expect(parseOpeningHours({ isOpen: false, nextOpenAt: '2026-01-19T10:00:00+02:00' }))
      .toEqual({ isOpen: false, nextOpenAt: Date.parse('2026-01-19T08:00:00Z') });
  });

  it('ignores anything malformed', () => {
    expect(parseOpeningHours(null)).toBeNull();
    expect(parseOpeningHours({ isOpen: 'no' })).toBeNull();
    expect(parseOpeningHours({ isOpen: false, nextOpenAt: 'soon' })).toEqual({ isOpen: false, nextOpenAt: null });
    expect(parseOpeningHours({ isOpen: true, nextOpenAt: '2026-01-19T08:00:00Z' })).toEqual({ isOpen: true, nextOpenAt: null });
  });
});
