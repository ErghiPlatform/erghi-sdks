import ErghiWidget from './index';
import {
  cleanPreChatValues, isPlausibleEmail, parsePreChatSettings, PRECHAT_OFF, preChatPending, validatePreChat,
} from './prechat';

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
const WIDGET = 'w-1';
const ON = { enabled: true, nameRequired: false, emailRequired: false };

describe('pre-chat rules', () => {
  it('reads the settings in either case, and a required flag only counts while the form is on', () => {
    expect(parsePreChatSettings({ preChatFormEnabled: true, preChatEmailRequired: true }))
      .toEqual({ enabled: true, nameRequired: false, emailRequired: true });
    expect(parsePreChatSettings({ PreChatFormEnabled: true, PreChatNameRequired: true }))
      .toEqual({ enabled: true, nameRequired: true, emailRequired: false });
    expect(parsePreChatSettings({ preChatFormEnabled: false, preChatNameRequired: true })).toEqual(PRECHAT_OFF);
    expect(parsePreChatSettings({ preChatFormEnabled: 'true' })).toEqual(PRECHAT_OFF);
    expect(parsePreChatSettings({})).toEqual(PRECHAT_OFF);
  });

  it('accepts the same emails as the API', () => {
    for (const ok of ['a@b.co', 'first.last+tag@sub.example.com', 'ليلى@مثال.مصر', '  padded@example.com ']) {
      expect(isPlausibleEmail(ok)).toBe(true);
    }
    for (const bad of ['not-an-email', 'a@b', 'a@@b.co', 'a b@c.co', '"Name" <a@b.co>', 'a@b..co', 'a@.co', 'a\u0000b@c.co', 'a\u200Bb@c.co']) {
      expect(isPlausibleEmail(bad)).toBe(false);
    }
  });

  it('cleans the values and leaves out blank fields', () => {
    expect(cleanPreChatValues('  Layla \n Hassan ', ' layla@example.com ')).toEqual({ name: 'Layla Hassan', email: 'layla@example.com' });
    expect(cleanPreChatValues('   ', '')).toEqual({});
    expect(cleanPreChatValues('x'.repeat(150), '').name).toHaveLength(100);
    // Direction overrides and zero-width spaces go; ZWNJ (Persian) stays.
    expect(cleanPreChatValues('\u202Egnp.exe\u200B', '').name).toBe('gnp.exe');
    expect(cleanPreChatValues('\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645', '').name).toBe('\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645');
  });

  it('reports the first problem with each field', () => {
    const both = { enabled: true, nameRequired: true, emailRequired: true };
    expect(validatePreChat({}, both)).toEqual({ name: 'nameRequired', email: 'emailRequired' });
    expect(validatePreChat({ name: 'L', email: 'nope' }, both)).toEqual({ email: 'emailInvalid' });
    expect(validatePreChat({ email: 'nope' }, ON)).toEqual({ email: 'emailInvalid' });
    expect(validatePreChat({ email: `${'a'.repeat(250)}@b.com` }, ON)).toEqual({ email: 'emailInvalid' });
    expect(validatePreChat({}, ON)).toEqual({});
  });

  it('stands in the way only before the first message, and never for a host-identified visitor', () => {
    const base = { settings: ON, answered: false, hasConversation: false, hostIdentified: false };
    expect(preChatPending(base)).toBe(true);
    expect(preChatPending({ ...base, settings: PRECHAT_OFF })).toBe(false);
    expect(preChatPending({ ...base, answered: true })).toBe(false);
    expect(preChatPending({ ...base, hasConversation: true })).toBe(false);
    expect(preChatPending({ ...base, hostIdentified: true })).toBe(false);
  });
});

describe('widget pre-chat form', () => {
  type Call = { url: string; method: string; body: Record<string, unknown> | null };
  let calls: Call[];
  let widget: ErghiWidget | null = null;
  const flush = () => new Promise(resolve => setTimeout(resolve, 20));
  const shadow = () => document.getElementById('erghi-widget-root')!.shadowRoot!;
  const el = <T extends HTMLElement>(id: string) => shadow().getElementById(id) as T;
  const form = () => el<HTMLFormElement>('cf-prechat');
  const root = () => shadow().querySelector('.root')!;
  const conversationPosts = () => calls.filter(c => c.method === 'POST' && c.url === `${API}/api/conversations`);

  function serve(publicConfig: Record<string, unknown>, createStatus = 200, createErrors: Record<string, string[]> = { 'preChat.email': ['Enter a valid email address.'] }): void {
    calls = [];
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      calls.push({ url: u, method, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
      if (u.endsWith(`/api/widgets/${WIDGET}/public`)) {
        return { ok: true, status: 200, json: async () => ({ companyName: 'Shop', ...publicConfig }) };
      }
      if (u === `${API}/api/conversations` && method === 'POST') {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        if (createStatus === 401 && body.identityToken) {
          return { ok: false, status: 401, json: async () => ({}) };
        }
        if (createStatus !== 200 && createStatus !== 401) {
          return { ok: false, status: createStatus, json: async () => ({ error: 'Invalid', code: 'validation_failed', errors: createErrors }) };
        }
        return { ok: true, status: 200, json: async () => ({ id: 'conv-1', visitorToken: 'vt-1' }) };
      }
      if (u.includes('/api/conversations/conv-1/messages') && method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ id: 'srv-visitor' }) };
      }
      if (u.includes('/api/conversations/conv-1/messages')) {
        return { ok: true, status: 200, json: async () => [] };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;
  }

  async function mount(extra: Record<string, unknown> = {}): Promise<ErghiWidget> {
    widget = new ErghiWidget({ widgetId: WIDGET, apiUrl: API, locale: 'en', ...extra });
    await flush();
    await flush();
    widget.open();
    await flush();
    return widget;
  }

  function type(name: string, email: string): void {
    el<HTMLInputElement>('cf-prechat-name').value = name;
    el<HTMLInputElement>('cf-prechat-email').value = email;
  }

  async function send(text: string): Promise<void> {
    el<HTMLInputElement>('cf-input').value = text;
    el<HTMLButtonElement>('cf-send').click();
    await flush();
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  afterEach(async () => {
    await widget?.destroy();
    widget = null;
  });

  it('stays out of the way when the workspace has the form off', async () => {
    serve({});
    await mount();
    expect(form().hidden).toBe(true);
    expect(root().classList.contains('prechat-open')).toBe(false);
    await send('Hi');
    expect(conversationPosts()).toHaveLength(1);
    expect(conversationPosts()[0].body?.['preChat']).toBeUndefined();
  });

  it('shows the form before the first message, hides the composer, and creates nothing yet', async () => {
    serve({ preChatFormEnabled: true });
    await mount();
    expect(form().hidden).toBe(false);
    expect(root().classList.contains('prechat-open')).toBe(true);
    expect(el('cf-prechat-skip').hidden).toBe(false);
    expect(form().textContent).toContain('(optional)');
    expect(conversationPosts()).toHaveLength(0);
  });

  it('sends the values with the request that creates the conversation', async () => {
    serve({ preChatFormEnabled: true });
    await mount();
    type(' Layla Hassan ', 'layla@example.com');
    form().dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(form().hidden).toBe(true);
    expect(conversationPosts()).toHaveLength(0);

    await send('Do you ship to Cairo?');
    expect(conversationPosts()).toHaveLength(1);
    expect(conversationPosts()[0].body?.['preChat']).toEqual({ name: 'Layla Hassan', email: 'layla@example.com' });
    expect(form().hidden).toBe(true);
  });

  it('lets the visitor skip, and then sends nothing', async () => {
    serve({ preChatFormEnabled: true });
    await mount();
    el<HTMLButtonElement>('cf-prechat-skip').click();
    await flush();
    expect(form().hidden).toBe(true);
    await send('Hi');
    expect(conversationPosts()).toHaveLength(1);
    expect(conversationPosts()[0].body?.['preChat']).toBeUndefined();
  });

  it('cannot be skipped when a field is required, and says what is missing', async () => {
    serve({ preChatFormEnabled: true, preChatEmailRequired: true });
    await mount();
    expect(el('cf-prechat-skip').hidden).toBe(true);
    expect(el('cf-prechat-email').getAttribute('aria-required')).toBe('true');

    form().dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(form().hidden).toBe(false);
    const error = el('cf-prechat-email-error');
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBeTruthy();
    expect(el('cf-prechat-email').getAttribute('aria-invalid')).toBe('true');
    expect(shadow().activeElement?.id).toBe('cf-prechat-email');

    type('', 'not-an-email');
    form().dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(form().hidden).toBe(false);
    expect(error.textContent).not.toBe('');

    type('', 'layla@example.com');
    form().dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(form().hidden).toBe(true);
    expect(error.hidden).toBe(true);
  });

  it('holds a message typed before the form is answered instead of sending it', async () => {
    serve({ preChatFormEnabled: true });
    await mount();
    el<HTMLInputElement>('cf-input').value = 'Where is my order?';
    await (widget as unknown as { startConversation(): Promise<void> }).startConversation();
    await flush();
    expect(conversationPosts()).toHaveLength(0);
    expect(form().hidden).toBe(false);
    expect(el<HTMLInputElement>('cf-input').value).toBe('Where is my order?');
  });

  it('asks again when the API refuses the email', async () => {
    serve({ preChatFormEnabled: true }, 400);
    await mount();
    type('Layla', 'layla@example.com');
    form().dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    await send('Hi');
    expect(conversationPosts()).toHaveLength(1);
    expect(form().hidden).toBe(false);
    expect(el('cf-prechat-email-error').hidden).toBe(false);
  });

  it('treats any other 400 as a connection problem, not a bad email', async () => {
    serve({ preChatFormEnabled: true }, 400, { metadata: ['Too large.'] });
    await mount();
    type('Layla', '');
    form().dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    await send('Hi');
    expect(form().hidden).toBe(true);
    expect(el('cf-prechat-email-error').hidden).toBe(true);
    expect(shadow().textContent).toContain('Unable to connect');
  });

  it('asks the visitor after all when the host identity token is refused', async () => {
    serve({ preChatFormEnabled: true }, 401);
    await mount({ identityToken: 'header.payload.sig' });
    expect(form().hidden).toBe(true);
    await send('Hi');
    expect(form().hidden).toBe(false);
    expect(conversationPosts()).toHaveLength(1); // only the refused one
    el<HTMLButtonElement>('cf-prechat-skip').click();
    await flush();
    await send('Hi');
    expect(conversationPosts()).toHaveLength(2);
    expect(conversationPosts()[1].body?.['identityToken']).toBeUndefined();
  });

  it('never asks a visitor the host already identified', async () => {
    serve({ preChatFormEnabled: true, preChatNameRequired: true });
    await mount({ identityToken: 'header.payload.sig' });
    expect(form().hidden).toBe(true);
    await send('Hi');
    expect(conversationPosts()).toHaveLength(1);
    expect(conversationPosts()[0].body?.['preChat']).toBeUndefined();
  });

  it('never asks a visitor returning to a conversation', async () => {
    localStorage.setItem(`erghi:session:${WIDGET}`, JSON.stringify({ conversationId: 'conv-1', visitorToken: 'vt-1' }));
    serve({ preChatFormEnabled: true });
    await mount();
    expect(form().hidden).toBe(true);
  });

  it('speaks the page language, right to left in Arabic', async () => {
    serve({ preChatFormEnabled: true });
    await mount({ locale: 'ar' });
    expect(form().hidden).toBe(false);
    expect(el('cf-prechat-start').textContent).not.toMatch(/Start/);
    expect(el('cf-prechat-email').getAttribute('dir')).toBe('ltr');
  });
});
