import ErghiWidget from './index';
import { campaignMatchesPage, markCampaignSeen, parseCampaigns, pickCampaign, PublicCampaign, readSeenCampaigns } from './campaigns';

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
const page = (path: string) => ({
  href: `https://shop.example.com${path}`, pathname: path.split(/[?#]/)[0], search: '', hash: '',
});
const campaign = (over: Partial<PublicCampaign> = {}): PublicCampaign => ({
  id: 'c-1', message: 'Questions about plans?', urlMatch: 'any', urlValue: null, delaySeconds: 0, ...over,
});

describe('campaign rules', () => {
  it('keeps well-formed campaigns and drops malformed ones', () => {
    const parsed = parseCampaigns([
      { id: 'a', message: ' Hi ', urlMatch: 'contains', urlValue: ' /pricing ', delaySeconds: 12.4 },
      { Id: 'b', Message: 'Pascal', UrlMatch: 'ANY', DelaySeconds: 99999 },
      { id: '', message: 'no id', urlMatch: 'any', delaySeconds: 0 },
      { id: 'c', message: '', urlMatch: 'any', delaySeconds: 0 },
      { id: 'd', message: 'regex?', urlMatch: 'regex', urlValue: '.*', delaySeconds: 0 },
      { id: 'e', message: 'no value', urlMatch: 'equals', urlValue: '', delaySeconds: 0 },
      { id: 'f', message: 'x'.repeat(1001), urlMatch: 'any', delaySeconds: 0 },
      'nonsense', null,
    ]);
    expect(parsed).toEqual([
      { id: 'a', message: 'Hi', urlMatch: 'contains', urlValue: '/pricing', delaySeconds: 12 },
      { id: 'b', message: 'Pascal', urlMatch: 'any', urlValue: null, delaySeconds: 3600 },
    ]);
    expect(parseCampaigns(undefined)).toEqual([]);
    expect(parseCampaigns({ id: 'a' })).toEqual([]);
    expect(parseCampaigns(Array.from({ length: 40 }, (_, i) => ({ id: `${i}`, message: 'm', urlMatch: 'any', delaySeconds: 0 })))).toHaveLength(25);
  });

  it('matches a value starting with / against the path, anything else against the full address, ignoring case', () => {
    expect(campaignMatchesPage(campaign({ urlMatch: 'starts_with', urlValue: '/Pricing' }), page('/pricing/team'))).toBe(true);
    expect(campaignMatchesPage(campaign({ urlMatch: 'starts_with', urlValue: '/pricing' }), page('/blog/pricing'))).toBe(false);
    expect(campaignMatchesPage(campaign({ urlMatch: 'contains', urlValue: 'pricing' }), page('/blog/pricing'))).toBe(true);
    expect(campaignMatchesPage(campaign({ urlMatch: 'equals', urlValue: '/pricing' }), page('/pricing/'))).toBe(true);
    expect(campaignMatchesPage(campaign({ urlMatch: 'equals', urlValue: '/pricing' }), page('/pricing/team'))).toBe(false);
    expect(campaignMatchesPage(campaign({ urlMatch: 'starts_with', urlValue: 'https://SHOP.example.com/' }), page('/x'))).toBe(true);
    expect(campaignMatchesPage(campaign({ urlMatch: 'starts_with', urlValue: 'https://other.com/' }), page('/x'))).toBe(false);
  });

  it('treats the value as plain text, never a pattern', () => {
    expect(campaignMatchesPage(campaign({ urlMatch: 'contains', urlValue: '.*' }), page('/anything'))).toBe(false);
    expect(campaignMatchesPage(campaign({ urlMatch: 'contains', urlValue: '/a.c' }), page('/abc'))).toBe(false);
  });

  it('remembers which campaigns this browser has seen and picks the first one it has not', () => {
    localStorage.clear();
    const list = [campaign({ id: 'one' }), campaign({ id: 'two' })];
    expect(pickCampaign(list, readSeenCampaigns(WIDGET), page('/'))?.id).toBe('one');
    markCampaignSeen(WIDGET, 'one');
    expect(pickCampaign(list, readSeenCampaigns(WIDGET), page('/'))?.id).toBe('two');
    markCampaignSeen(WIDGET, 'two');
    expect(pickCampaign(list, readSeenCampaigns(WIDGET), page('/'))).toBeNull();
    expect(readSeenCampaigns('other-widget').size).toBe(0);
    localStorage.setItem(`erghi:campaigns-seen:${WIDGET}`, '{not json');
    expect(readSeenCampaigns(WIDGET).size).toBe(0);
  });
});

describe('widget campaigns', () => {
  type Call = { url: string; method: string; body: Record<string, unknown> | null };
  let calls: Call[];
  let widget: ErghiWidget | null = null;
  const flush = () => new Promise(resolve => setTimeout(resolve, 20));
  const shadow = () => document.getElementById('erghi-widget-root')!.shadowRoot!;
  const conversationPosts = () => calls.filter(c => c.method === 'POST' && c.url === `${API}/api/conversations`);
  const campaignEls = () => [...shadow().querySelectorAll('.msg.bot')].filter(el => el.textContent?.includes('Questions about plans?'));

  function serve(campaigns: unknown[], serverMessages: unknown[] = []): void {
    calls = [];
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? 'GET';
      calls.push({ url: u, method, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
      if (u.endsWith(`/api/widgets/${WIDGET}/public`)) {
        return { ok: true, status: 200, json: async () => ({ companyName: 'Shop', campaigns }) };
      }
      if (u === `${API}/api/conversations` && method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ id: 'conv-1', visitorToken: 'vt-1' }) };
      }
      if (u.includes('/api/conversations/conv-1/messages') && method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ id: 'srv-visitor' }) };
      }
      if (u.includes('/api/conversations/conv-1/messages')) {
        return { ok: true, status: 200, json: async () => serverMessages };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;
  }

  async function mount(): Promise<ErghiWidget> {
    widget = new ErghiWidget({ widgetId: WIDGET, apiUrl: API });
    await flush();
    await flush();
    return widget;
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  afterEach(async () => {
    await widget?.destroy();
    widget = null;
  });

  it('shows a live campaign beside the closed launcher, without creating a conversation', async () => {
    serve([campaign()]);
    await mount();
    const teaser = shadow().getElementById('cf-teaser')!;
    expect(teaser.hidden).toBe(false);
    expect(shadow().getElementById('cf-teaser-open')!.textContent).toBe('Questions about plans?');
    expect(shadow().getElementById('cf-bubble')!.classList.contains('has-unread')).toBe(true);
    expect(campaignEls()).toHaveLength(1);
    expect(conversationPosts()).toHaveLength(0);
  });

  it('is the business speaking: no AI label and no rating buttons', async () => {
    serve([campaign()]);
    await mount();
    const el = campaignEls()[0];
    expect(el.querySelector('.msg-label')).toBeNull();
    expect(el.querySelector('.msg-feedback')).toBeNull();
  });

  it('puts the message on screen as text, never markup', async () => {
    serve([campaign({ message: '<img src=x onerror="alert(1)">Hi' })]);
    await mount();
    const teaserText = shadow().getElementById('cf-teaser-open')!;
    expect(teaserText.querySelector('img')).toBeNull();
    expect(teaserText.textContent).toContain('<img');
  });

  it('opening the chat to read it starts nothing; the first message starts the conversation with the campaign id', async () => {
    serve([campaign()], [
      { id: 'srv-campaign', content: 'Questions about plans?', sender: 'bot', source: 'campaign', createdAt: '2026-11-17T00:00:00Z' },
    ]);
    await mount();
    widget!.open();
    await flush();
    expect(shadow().getElementById('cf-teaser')!.hidden).toBe(true);
    expect(conversationPosts()).toHaveLength(0);

    (shadow().getElementById('cf-input') as HTMLInputElement).value = 'Yes, which plan has SSO?';
    shadow().getElementById('cf-send')!.click();
    await flush();
    expect(conversationPosts()).toHaveLength(1);
    expect(conversationPosts()[0].body?.['campaignId']).toBe('c-1');

    // The server stored its own copy of the campaign message; the widget adopts it instead of repeating it.
    await (widget as unknown as { fetchMissedMessages(): Promise<void> }).fetchMissedMessages();
    expect(campaignEls()).toHaveLength(1);
    expect(campaignEls()[0].getAttribute('data-id')).toBe('srv-campaign');
  });

  it('shows each campaign once per browser', async () => {
    serve([campaign()]);
    await mount();
    await widget!.destroy();
    document.body.innerHTML = '';
    serve([campaign()]);
    await mount();
    expect(shadow().getElementById('cf-teaser')!.hidden).toBe(true);
    expect(campaignEls()).toHaveLength(0);
  });

  it('skips campaigns for other pages', async () => {
    serve([campaign({ urlMatch: 'starts_with', urlValue: '/checkout' })]);
    await mount();
    expect(campaignEls()).toHaveLength(0);
  });

  it('does not interrupt a visitor who already has a conversation', async () => {
    localStorage.setItem(`erghi:session:${WIDGET}`, JSON.stringify({ conversationId: 'conv-1', visitorToken: 'vt-1' }));
    serve([campaign()]);
    await mount();
    expect(campaignEls()).toHaveLength(0);
    expect(shadow().getElementById('cf-teaser')!.hidden).toBe(true);
  });

  it('sends no campaign id when the visitor chats without one', async () => {
    serve([]);
    await mount();
    widget!.open();
    await flush();
    expect(conversationPosts()).toHaveLength(1);
    expect(conversationPosts()[0].body?.['campaignId']).toBeUndefined();
  });
});
