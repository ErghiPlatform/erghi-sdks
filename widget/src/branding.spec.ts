import ErghiWidget, { clampCornerRadius, safeLogoUrl } from './index';
import { contrast, DARK_SURFACE, LIGHT_SURFACE, MIN_TEXT_CONTRAST, normalizeHex, readableAccent } from './color';
import { radii } from './styles';

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
    }),
  })),
  HubConnectionState: { Connected: 'Connected', Disconnected: 'Disconnected' },
  HttpTransportType: { WebSockets: 1, ServerSentEvents: 2, LongPolling: 4 },
  LogLevel: { Information: 1 },
}));

const API = 'https://api.test.com';

type Workspace = Record<string, unknown>;

/** Serves `workspace` from /public and an empty translation set. */
function serve(workspace: Workspace | null): void {
  global.fetch = jest.fn(async (url: string) => {
    if (String(url).includes('/public')) {
      return workspace ? { ok: true, json: async () => workspace } : { ok: false, json: async () => ({}) };
    }
    return { ok: true, json: async () => ({}) };
  }) as unknown as typeof fetch;
}

const flush = () => new Promise(resolve => setTimeout(resolve, 10));

async function mount(config: Partial<ConstructorParameters<typeof ErghiWidget>[0]> = {}) {
  const widget = new ErghiWidget({ widgetId: 'w-1', apiUrl: API, ...config });
  await flush();
  const shadow = document.getElementById('erghi-widget-root')!.shadowRoot!;
  return {
    widget,
    shadow,
    root: shadow.querySelector('.root') as HTMLElement,
    css: shadow.querySelector('style')!.textContent ?? '',
  };
}

describe('colour helpers', () => {
  it('accepts only hex colours, normalised to #rrggbb', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex(' #4352CF ')).toBe('#4352cf');
    expect(normalizeHex('red')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('#fff;} .root{display:none')).toBeNull();
    expect(normalizeHex(42)).toBeNull();
  });

  it('keeps an accent that already reads, and shifts one that does not until it does', () => {
    expect(readableAccent('#1d4ed8', LIGHT_SURFACE, '#000000')).toBe('#1d4ed8');
    for (const accent of ['#fde68a', '#ffffff', '#93c5fd']) {
      const onLight = readableAccent(accent, LIGHT_SURFACE, '#000000');
      expect(contrast(onLight, LIGHT_SURFACE)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
    for (const accent of ['#1e3a8a', '#000000', '#4352cf']) {
      const onDark = readableAccent(accent, DARK_SURFACE, '#ffffff');
      expect(contrast(onDark, DARK_SURFACE)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });

  it('clamps the corner radius to whole pixels in 0-50', () => {
    expect(clampCornerRadius(-4)).toBe(0);
    expect(clampCornerRadius(80)).toBe(50);
    expect(clampCornerRadius(7.6)).toBe(8);
    expect(clampCornerRadius('20')).toBe(12);
    expect(clampCornerRadius(NaN)).toBe(12);
  });

  it('derives square corners at 0 and round ones at the top of the range', () => {
    expect(radii(0)).toEqual({ panel: 0, message: 2, control: '0px', launcher: '4px' });
    expect(radii(50)).toEqual({ panel: 28, message: 18, control: '999px', launcher: '50%' });
  });
});

describe('logo URL', () => {
  it('allows https anywhere and http only from the API itself', () => {
    expect(safeLogoUrl('https://cdn.example.com/logo.png', API)).toBe('https://cdn.example.com/logo.png');
    expect(safeLogoUrl('http://localhost:5080/api/v1/branding/public/x/logo', 'http://localhost:5080'))
      .toBe('http://localhost:5080/api/v1/branding/public/x/logo');
    expect(safeLogoUrl('http://evil.example.com/logo.png', API)).toBe('');
    expect(safeLogoUrl('data:image/svg+xml,<svg onload=alert(1)>', API)).toBe('');
    expect(safeLogoUrl('javascript:alert(1)', API)).toBe('');
    expect(safeLogoUrl(null, API)).toBe('');
  });
});

describe('workspace branding in the widget', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    localStorage.clear();
  });

  it('uses the workspace settings when the embed sets nothing', async () => {
    serve({
      primaryColor: '#0F766E', widgetTheme: 'dark', widgetPosition: 'bottom-left',
      widgetCornerRadius: 0, companyName: 'Nimbus', welcomeMessage: 'Welcome to Nimbus',
    });
    const { widget, root, css, shadow } = await mount();
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(css).toContain('--cf-primary: #0f766e');
    expect(css).toContain('left: 20px');
    expect(css).toContain('--cf-r-panel: 0px');
    expect(shadow.querySelector('.header-title')?.textContent).toBe('Nimbus');
    expect(shadow.querySelector('.msg.system')?.textContent).toContain('Welcome to Nimbus');
    widget.destroy();
  });

  it('greets in the visitor\'s language when the workspace set no welcome message', async () => {
    localStorage.setItem('erghi:locale', 'de');
    serve({ companyName: 'Nimbus', welcomeMessage: null, aiAssistantName: null });
    const { widget, shadow } = await mount();
    expect(shadow.querySelector('.msg.system')?.textContent).toContain('Wie können wir Ihnen heute helfen?');
    widget.destroy();
  });

  it('lets embed attributes win over the workspace settings', async () => {
    serve({ primaryColor: '#0f766e', widgetTheme: 'dark', widgetPosition: 'bottom-left', companyName: 'Nimbus' });
    const { widget, root, css, shadow } = await mount({
      primaryColor: '#ff0000', theme: 'light', position: 'bottom-right', title: 'Support',
    });
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(css).toContain('--cf-primary: #ff0000');
    expect(css).toContain('right: 20px');
    expect(shadow.querySelector('.header-title')?.textContent).toBe('Support');
    widget.destroy();
  });

  it('ignores invalid values from either source and falls back to the next one', async () => {
    serve({ primaryColor: 'url(javascript:1)', widgetTheme: 'neon', widgetPosition: 'top-left', widgetCornerRadius: 999 });
    const { widget, root, css } = await mount({
      primaryColor: 'expression(alert(1))',
      theme: 'sepia' as never,
      position: 'middle' as never,
    });
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(css).toContain('--cf-primary: #3b82f6');
    expect(css).not.toContain('javascript');
    expect(css).not.toContain('expression');
    expect(css).toContain('right: 20px');
    expect(css).toContain('--cf-r-panel: 28px');
    widget.destroy();
  });

  it('falls back to built-in defaults when the workspace settings cannot be loaded', async () => {
    serve(null);
    const { widget, root, css, shadow } = await mount();
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(css).toContain('--cf-primary: #3b82f6');
    expect(shadow.querySelector('.header-logo')).toBeNull();
    widget.destroy();
  });

  it('follows the system colour scheme for the auto theme, in CSS', async () => {
    serve({ widgetTheme: 'auto' });
    const { widget, root, css } = await mount();
    expect(root.getAttribute('data-theme')).toBe('auto');
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\)\s*{\s*\.root\[data-theme="auto"\]/);
    widget.destroy();
  });

  it('uses the secondary colour as the accent, made readable for each theme', async () => {
    serve({ primaryColor: '#4352cf', secondaryColor: '#fde68a' });
    const { widget, css } = await mount();
    const light = /--cf-accent-light: (#[0-9a-f]{6})/.exec(css)![1];
    const dark = /--cf-accent-dark: (#[0-9a-f]{6})/.exec(css)![1];
    expect(contrast(light, LIGHT_SURFACE)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    expect(contrast(dark, DARK_SURFACE)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    expect(dark).toBe('#fde68a');
    widget.destroy();
  });

  it('defaults the accent to the primary colour', async () => {
    serve({ primaryColor: '#1d4ed8' });
    const { widget, css } = await mount();
    expect(css).toContain('--cf-accent-light: #1d4ed8');
    widget.destroy();
  });

  it('shows an https logo beside the name, decorative and 32px', async () => {
    serve({ logoUrl: 'https://cdn.example.com/logo.png', companyName: 'Nimbus' });
    const { widget, shadow } = await mount();
    const img = shadow.querySelector('.header-logo') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toBe('https://cdn.example.com/logo.png');
    expect(img.alt).toBe('');
    expect(img.width).toBe(32);
    expect(shadow.querySelector('.header-title')?.textContent).toBe('Nimbus');
    widget.destroy();
  });

  it('removes the logo when it fails to load, leaving the name', async () => {
    serve({ logoUrl: 'https://cdn.example.com/missing.png', companyName: 'Nimbus' });
    const { widget, shadow } = await mount();
    shadow.querySelector('.header-logo')!.dispatchEvent(new Event('error'));
    expect(shadow.querySelector('.header-logo')).toBeNull();
    expect(shadow.querySelector('.header-title')?.textContent).toBe('Nimbus');
    widget.destroy();
  });

  it('never shows a non-https logo from another origin', async () => {
    serve({ logoUrl: 'http://tracker.example.com/pixel.png' });
    const { widget, shadow } = await mount();
    expect(shadow.querySelector('.header-logo')).toBeNull();
    widget.destroy();
  });
});

describe('start-up when the API is slow', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('appears with the defaults after 3 s instead of waiting forever', async () => {
    const signals: AbortSignal[] = [];
    global.fetch = jest.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (signal) {
        signals.push(signal);
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }
    })) as unknown as typeof fetch;

    const widget = new ErghiWidget({ widgetId: 'w-1', apiUrl: API });
    await jest.advanceTimersByTimeAsync(2900);
    expect(document.getElementById('erghi-widget-root')).toBeNull();

    await jest.advanceTimersByTimeAsync(200);
    const shadow = document.getElementById('erghi-widget-root')?.shadowRoot;
    expect(shadow).toBeTruthy();
    expect(shadow!.querySelector('style')!.textContent).toContain('--cf-primary: #3b82f6');
    expect(signals.length).toBe(2);
    expect(signals.every(s => s.aborted)).toBe(true);
    widget.destroy();
  });
});
