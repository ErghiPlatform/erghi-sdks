import ErghiWidget from './index';
import {
  detectLanguage, fileExtension, pickVoice, resetLanguageDetector, speakableText, speechChunks,
} from './voice';

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
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x86]);
const flush = () => new Promise(resolve => setTimeout(resolve, 10));

type Listener = (event: unknown) => void;

class FakeMediaRecorder {
  static last: FakeMediaRecorder | null = null;
  static isTypeSupported = (type: string) => type === 'audio/webm;codecs=opus';
  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  options: MediaRecorderOptions | undefined;
  private listeners: Record<string, Listener[]> = {};

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.options = options;
    this.mimeType = options?.mimeType ?? '';
    FakeMediaRecorder.last = this;
  }

  addEventListener(type: string, fn: Listener): void {
    (this.listeners[type] ??= []).push(fn);
  }

  start(): void {
    this.state = 'recording';
  }

  stop(): void {
    this.state = 'inactive';
    this.listeners['dataavailable']?.forEach(fn => fn({ data: new Blob([WEBM], { type: this.mimeType }) }));
    this.listeners['stop']?.forEach(fn => fn({}));
  }
}

class FakeUtterance {
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

const trackStop = jest.fn();
const getUserMedia = jest.fn();
const synth = {
  speak: jest.fn(),
  cancel: jest.fn(),
  getVoices: jest.fn((): SpeechSynthesisVoice[] => []),
};

interface Call {
  url: string;
  init?: RequestInit;
}

let calls: Call[] = [];
let voiceResponse: { status: number; body: unknown } = { status: 200, body: {} };

function serve(workspace: Record<string, unknown>): void {
  calls = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    if (u.includes(`/api/widgets/`) && u.endsWith('/public')) return { ok: true, json: async () => workspace };
    if (u.endsWith('/api/conversations') && init?.method === 'POST') {
      return { ok: true, json: async () => ({ id: 'conv-1', visitorToken: 'vt-1', workspaceId: 'ws-1' }) };
    }
    if (u.endsWith('/voice')) {
      return { ok: voiceResponse.status < 300, status: voiceResponse.status, json: async () => voiceResponse.body };
    }
    if (u.includes('/branding/public/')) return { ok: true, json: async () => workspace };
    return { ok: true, json: async () => ({}) };
  }) as unknown as typeof fetch;
}

async function mount(config: Partial<ConstructorParameters<typeof ErghiWidget>[0]> = {}) {
  const widget = new ErghiWidget({ widgetId: 'w-1', apiUrl: API, ...config });
  await flush();
  const shadow = document.getElementById('erghi-widget-root')!.shadowRoot!;
  return { widget, shadow, $: (id: string) => shadow.getElementById(id) as HTMLElement };
}

function inbound(widget: ErghiWidget, msg: { id: string; content: string; sender: string }): void {
  (widget as unknown as { handleInboundMessage(m: typeof msg): void }).handleInboundMessage(msg);
}

let widget: ErghiWidget | null = null;

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  FakeMediaRecorder.last = null;
  voiceResponse = { status: 200, body: { id: 'msg-9', content: 'where is my order', source: 'voice' } };
  getUserMedia.mockReset().mockResolvedValue({ getTracks: () => [{ stop: trackStop }] });
  trackStop.mockReset();
  synth.speak.mockReset();
  synth.cancel.mockReset();
  synth.getVoices.mockReset().mockReturnValue([]);
  Object.defineProperty(globalThis, 'MediaRecorder', { value: FakeMediaRecorder, configurable: true, writable: true });
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true, writable: true });
  resetLanguageDetector();
});

afterEach(() => {
  widget?.destroy();
  widget = null;
  delete (globalThis as { LanguageDetector?: unknown }).LanguageDetector;
});

describe('speakableText', () => {
  it('drops markdown syntax, code and bare links but keeps link labels', () => {
    const md = '## Shipping\n\n- **Free** over $50\n- See [our policy](https://x.test/p) or https://x.test/raw\n\n```js\nconst a = 1;\n```\nUse `code` _here_.';
    expect(speakableText(md)).toBe('Shipping Free over $50 See our policy or Use code here.');
  });

  it('leaves non-Latin text untouched', () => {
    expect(speakableText('**مرحبا** بك')).toBe('مرحبا بك');
  });
});

describe('speechChunks', () => {
  it('keeps short text whole and splits long text at sentence ends in any script', () => {
    expect(speechChunks('Hello there.')).toEqual(['Hello there.']);
    const arabic = 'هذه جملة أولى طويلة نسبيا؟ وهذه جملة ثانية. ';
    const chunks = speechChunks(arabic.repeat(10), 100);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach(c => expect(c.length).toBeLessThanOrEqual(100));
    expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(arabic.repeat(10).trim().replace(/\s+/g, ' '));
  });

  it('breaks a single overlong sentence at word boundaries', () => {
    const chunks = speechChunks('word '.repeat(100), 50);
    chunks.forEach(c => expect(c.length).toBeLessThanOrEqual(50));
    expect(chunks.join(' ').split(' ')).toHaveLength(100);
  });
});

describe('pickVoice', () => {
  const voice = (lang: string, localService = true) => ({ lang, localService, name: lang } as SpeechSynthesisVoice);

  it('prefers the exact region, then a local voice of the same language', () => {
    const voices = [voice('en-US', false), voice('ar-EG', false), voice('ar-SA'), voice('en-GB')];
    expect(pickVoice(voices, 'ar-SA')?.lang).toBe('ar-SA');
    expect(pickVoice(voices, 'ar')?.lang).toBe('ar-SA');
    expect(pickVoice(voices, 'en')?.lang).toBe('en-GB');
    expect(pickVoice(voices, 'fr')).toBeNull();
  });
});

describe('fileExtension', () => {
  it('maps recorder types to the extension the server expects', () => {
    expect(fileExtension('audio/webm;codecs=opus')).toBe('webm');
    expect(fileExtension('audio/mp4')).toBe('m4a');
    expect(fileExtension('audio/ogg;codecs=opus')).toBe('ogg');
    expect(fileExtension('')).toBe('webm');
  });
});

describe('detectLanguage', () => {
  it('falls back when the browser has no detector', async () => {
    expect(await detectLanguage('hola', 'en')).toBe('en');
  });

  it('uses an installed on-device detector when confident', async () => {
    const detect = jest.fn().mockResolvedValue([{ detectedLanguage: 'ar', confidence: 0.97 }]);
    (globalThis as { LanguageDetector?: unknown }).LanguageDetector = {
      availability: async () => 'available',
      create: async () => ({ detect }),
    };
    expect(await detectLanguage('مرحبا بك', 'en')).toBe('ar');
  });

  it('never downloads a model and ignores low-confidence guesses', async () => {
    const create = jest.fn();
    (globalThis as { LanguageDetector?: unknown }).LanguageDetector = { availability: async () => 'downloadable', create };
    expect(await detectLanguage('hello', 'en')).toBe('en');
    expect(create).not.toHaveBeenCalled();

    resetLanguageDetector();
    (globalThis as { LanguageDetector?: unknown }).LanguageDetector = {
      availability: async () => 'available',
      create: async () => ({ detect: async () => [{ detectedLanguage: 'it', confidence: 0.3 }] }),
    };
    expect(await detectLanguage('ok', 'en')).toBe('en');
  });
});

describe('widget voice input', () => {
  it('hides the mic unless the workspace turned voice input on', async () => {
    serve({ voiceInputEnabled: false });
    const off = await mount();
    widget = off.widget;
    expect(off.$('cf-mic').hidden).toBe(true);
    widget.destroy();

    serve({ voiceInputEnabled: true });
    const on = await mount();
    widget = on.widget;
    expect(on.$('cf-mic').hidden).toBe(false);
  });

  it('hides the mic when the browser cannot record and no recordAudio hook is given', async () => {
    Object.defineProperty(globalThis, 'MediaRecorder', { value: undefined, configurable: true, writable: true });
    serve({ voiceInputEnabled: true });
    const m = await mount();
    widget = m.widget;
    expect(m.$('cf-mic').hidden).toBe(true);
  });

  it('records, uploads the clip with the visitor token and shows the transcript', async () => {
    serve({ voiceInputEnabled: true });
    const m = await mount();
    widget = m.widget;
    m.$('cf-mic').click();
    await flush();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(FakeMediaRecorder.last?.mimeType).toBe('audio/webm;codecs=opus');
    expect(FakeMediaRecorder.last?.options?.audioBitsPerSecond).toBe(48_000);
    expect(m.$('cf-mic').classList.contains('recording')).toBe(true);
    expect((m.$('cf-input') as HTMLInputElement).disabled).toBe(true);
    expect(m.$('cf-mic-cancel').hidden).toBe(false);

    m.$('cf-mic').click();
    await flush();
    await flush();

    const upload = calls.find(c => c.url.endsWith('/api/conversations/conv-1/voice'));
    expect(upload).toBeDefined();
    expect((upload!.init!.headers as Record<string, string>)['X-Visitor-Token']).toBe('vt-1');
    const file = (upload!.init!.body as FormData).get('file') as File;
    expect(file.name).toBe('voice-note.webm');
    expect(trackStop).toHaveBeenCalled();

    const sent = m.shadow.querySelector('[data-id="msg-9"]')!;
    expect(sent.querySelector('.msg-text')!.textContent).toBe('where is my order');
    expect(sent.querySelector('.msg-voice-badge')).not.toBeNull();
    expect(sent.classList.contains('pending')).toBe(false);
    expect((m.$('cf-input') as HTMLInputElement).disabled).toBe(false);
  });

  it('cancelling releases the microphone and uploads nothing', async () => {
    serve({ voiceInputEnabled: true });
    const m = await mount();
    widget = m.widget;
    m.$('cf-mic').click();
    await flush();
    m.$('cf-mic-cancel').click();
    await flush();
    expect(trackStop).toHaveBeenCalled();
    expect(calls.some(c => c.url.endsWith('/voice'))).toBe(false);
    expect(m.$('cf-mic').classList.contains('recording')).toBe(false);
  });

  it('explains a blocked microphone', async () => {
    getUserMedia.mockRejectedValue(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
    serve({ voiceInputEnabled: true });
    const m = await mount();
    widget = m.widget;
    m.$('cf-mic').click();
    await flush();
    expect(m.shadow.textContent).toContain('Microphone access is blocked');
  });

  it.each([
    [422, 'voice_no_speech', "We couldn't hear anything"],
    [429, 'voice_limit_reached', "Voice messages aren't available right now"],
    [503, 'voice_unavailable', "Your voice message couldn't be sent"],
  ])('maps a %i %s response to a message and removes the placeholder', async (status, code, text) => {
    voiceResponse = { status, body: { error: 'x', code } };
    serve({ voiceInputEnabled: true });
    const m = await mount();
    widget = m.widget;
    m.$('cf-mic').click();
    await flush();
    m.$('cf-mic').click();
    await flush();
    await flush();
    expect(m.shadow.textContent).toContain(text);
    expect(m.shadow.querySelector('.msg.pending')).toBeNull();
  });

  it('hides the mic after the server says voice input is off', async () => {
    voiceResponse = { status: 403, body: { error: 'x', code: 'voice_disabled' } };
    serve({ voiceInputEnabled: true });
    const m = await mount();
    widget = m.widget;
    m.$('cf-mic').click();
    await flush();
    m.$('cf-mic').click();
    await flush();
    await flush();
    expect(m.$('cf-mic').hidden).toBe(true);
  });

  it('uses the recordAudio hook instead of MediaRecorder when given', async () => {
    Object.defineProperty(globalThis, 'MediaRecorder', { value: undefined, configurable: true, writable: true });
    const recordAudio = jest.fn().mockResolvedValue(new Blob([WEBM], { type: 'audio/mp4' }));
    serve({ voiceInputEnabled: true });
    const m = await mount({ recordAudio });
    widget = m.widget;
    expect(m.$('cf-mic').hidden).toBe(false);
    m.$('cf-mic').click();
    await flush();
    await flush();
    const upload = calls.find(c => c.url.endsWith('/voice'));
    expect(((upload!.init!.body as FormData).get('file') as File).name).toBe('voice-note.m4a');
  });
});

describe('widget voice replies', () => {
  it('shows read-aloud buttons only when the workspace turned voice replies on', async () => {
    serve({ voiceOutputEnabled: false });
    const off = await mount();
    widget = off.widget;
    expect(off.shadow.querySelector('.root')!.classList.contains('voice-out')).toBe(false);
    widget.destroy();

    serve({ voiceOutputEnabled: true });
    const on = await mount();
    widget = on.widget;
    inbound(widget, { id: 'b-1', content: 'Hello', sender: 'bot' });
    expect(on.shadow.querySelector('.root')!.classList.contains('voice-out')).toBe(true);
    expect(on.shadow.querySelector('[data-id="b-1"] .msg-speak')).not.toBeNull();
  });

  it('reads a reply with the device voice for its language and toggles off on a second tap', async () => {
    synth.getVoices.mockReturnValue([{ lang: 'ar-EG', localService: true, name: 'Maged' } as SpeechSynthesisVoice]);
    localStorage.setItem('erghi:locale', 'ar');
    serve({ voiceOutputEnabled: true });
    const m = await mount();
    widget = m.widget;
    inbound(widget, { id: 'b-1', content: '**أهلاً** بك', sender: 'bot' });

    const button = m.shadow.querySelector('[data-id="b-1"] .msg-speak') as HTMLButtonElement;
    button.click();
    await flush();
    const utterance = synth.speak.mock.calls[0][0] as FakeUtterance;
    expect(utterance.text).toBe('أهلاً بك');
    expect(utterance.lang).toBe('ar-EG');
    expect(button.getAttribute('aria-pressed')).toBe('true');

    button.click();
    expect(synth.cancel).toHaveBeenCalled();
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('marks the button idle when speech ends', async () => {
    serve({ voiceOutputEnabled: true });
    const m = await mount();
    widget = m.widget;
    inbound(widget, { id: 'b-1', content: 'Hi', sender: 'agent' });
    const button = m.shadow.querySelector('[data-id="b-1"] .msg-speak') as HTMLButtonElement;
    button.click();
    await flush();
    (synth.speak.mock.calls[0][0] as FakeUtterance).onend!();
    expect(button.classList.contains('speaking')).toBe(false);
  });

  it('hands speech to the speak hook when given', async () => {
    const speak = jest.fn().mockResolvedValue(undefined);
    serve({ voiceOutputEnabled: true });
    const m = await mount({ speak });
    widget = m.widget;
    inbound(widget, { id: 'b-1', content: 'Your order ships today.', sender: 'bot' });
    (m.shadow.querySelector('[data-id="b-1"] .msg-speak') as HTMLButtonElement).click();
    await flush();
    expect(speak).toHaveBeenCalledWith('Your order ships today.', 'en');
    expect(synth.speak).not.toHaveBeenCalled();
  });
});
