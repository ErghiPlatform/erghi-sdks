import { ConversationRealtimeClient, RealtimeMessage } from './realtime';

type SignalRCallback = (payload: unknown) => void;

const registeredHandlers = new Map<string, SignalRCallback>();

const withUrlSpy = jest.fn().mockReturnThis();

jest.mock('@microsoft/signalr', () => ({
  HubConnectionBuilder: jest.fn().mockImplementation(() => ({
    withUrl: withUrlSpy,
    withAutomaticReconnect: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnValue({
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      on: jest.fn((event: string, cb: SignalRCallback) => {
        registeredHandlers.set(event, cb);
      }),
      off: jest.fn(),
      invoke: jest.fn().mockResolvedValue(undefined),
      onclose: jest.fn(),
      onreconnecting: jest.fn(),
      onreconnected: jest.fn(),
      state: 'Connected',
    }),
  })),
  HubConnectionState: { Connected: 'Connected' },
}));

describe('ConversationRealtimeClient', () => {
  let client: ConversationRealtimeClient;
  let received: RealtimeMessage[];

  beforeEach(async () => {
    registeredHandlers.clear();
    withUrlSpy.mockClear();
    received = [];
    client = new ConversationRealtimeClient();
    await client.connect('https://api.test.com', 'conv-1', 'visitor-token-abc', {
      onMessage: (msg) => received.push(msg),
    });
  });

  afterEach(async () => {
    await client.disconnect();
  });

  function emitMessageReceived(raw: unknown) {
    registeredHandlers.get('MessageReceived')?.(raw);
  }

  it('normalizes camelCase sources into MessageSource objects', () => {
    emitMessageReceived({
      id: 'm1',
      content: 'hi',
      sender: 'bot',
      sources: [{ url: 'https://x.com/a', title: 'A' }],
    });

    expect(received[0].sources).toEqual([{ url: 'https://x.com/a', title: 'A' }]);
  });

  it('normalizes PascalCase sources (Url/Title) from the raw SignalR payload', () => {
    emitMessageReceived({
      Id: 'm2',
      Content: 'hi',
      Sender: 'bot',
      Sources: [{ Url: 'https://x.com/b', Title: 'B' }],
    });

    expect(received[0].sources).toEqual([{ url: 'https://x.com/b', title: 'B' }]);
  });

  it('defaults a missing title to null', () => {
    emitMessageReceived({
      id: 'm3',
      content: 'hi',
      sender: 'bot',
      sources: [{ url: 'https://x.com/c' }],
    });

    expect(received[0].sources).toEqual([{ url: 'https://x.com/c', title: null }]);
  });

  it('drops source entries with no url', () => {
    emitMessageReceived({
      id: 'm4',
      content: 'hi',
      sender: 'bot',
      sources: [{ title: 'no url here' }, { url: 'https://x.com/valid', title: 'valid' }],
    });

    expect(received[0].sources).toEqual([{ url: 'https://x.com/valid', title: 'valid' }]);
  });

  it('leaves sources undefined when the payload has none', () => {
    emitMessageReceived({ id: 'm5', content: 'hi', sender: 'bot' });

    expect(received[0].sources).toBeUndefined();
  });

  it('leaves sources undefined when the sources array is empty', () => {
    emitMessageReceived({ id: 'm6', content: 'hi', sender: 'bot', sources: [] });

    expect(received[0].sources).toBeUndefined();
  });

  it('ignores a non-array sources field rather than throwing', () => {
    emitMessageReceived({ id: 'm7', content: 'hi', sender: 'bot', sources: 'not-an-array' });

    expect(received).toHaveLength(1);
    expect(received[0].sources).toBeUndefined();
  });

  it('drops a message with no id or content entirely (does not call onMessage)', () => {
    emitMessageReceived({ sender: 'bot' });

    expect(received).toHaveLength(0);
  });

  describe('visitor token on the hub URL', () => {
    // VisitorChatHub (Erghi.Conversation P1-3/P1-4 fix) authorizes an anonymous connection
    // solely on this query param -- without it the server aborts the connection.
    it('appends the visitor token as a query parameter on connect', () => {
      const url = withUrlSpy.mock.calls[0][0] as string;
      expect(url).toBe('https://api.test.com/hubs/visitor?conversationId=conv-1&visitorToken=visitor-token-abc');
    });

    it('omits the visitorToken param when no token is available', async () => {
      withUrlSpy.mockClear();
      const noTokenClient = new ConversationRealtimeClient();
      await noTokenClient.connect('https://api.test.com', 'conv-2', null, {
        onMessage: () => undefined,
      });

      const url = withUrlSpy.mock.calls[0][0] as string;
      expect(url).toBe('https://api.test.com/hubs/visitor?conversationId=conv-2');
      await noTokenClient.disconnect();
    });

    it('URL-encodes a token containing special characters', async () => {
      withUrlSpy.mockClear();
      const specialClient = new ConversationRealtimeClient();
      await specialClient.connect('https://api.test.com', 'conv-3', 'a+b/c=d', {
        onMessage: () => undefined,
      });

      const url = withUrlSpy.mock.calls[0][0] as string;
      expect(url).toBe('https://api.test.com/hubs/visitor?conversationId=conv-3&visitorToken=a%2Bb%2Fc%3Dd');
      await specialClient.disconnect();
    });
  });

  describe('CORS credentials mode', () => {
    // Regression guard. @microsoft/signalr defaults withCredentials to true, making negotiate a
    // credentials:'include' request; the gateway's PublicWidgetPolicy reflects any origin and
    // deliberately omits Access-Control-Allow-Credentials, so the browser hard-blocks the
    // handshake from every real customer domain. Verified in a real browser against the running
    // gateway: default -> "blocked by CORS policy", withCredentials:false -> connection starts.
    it('connects with withCredentials disabled so the handshake is not credentialed', () => {
      const options = withUrlSpy.mock.calls[0][1] as { withCredentials?: boolean } | undefined;
      expect(options).toBeDefined();
      expect(options?.withCredentials).toBe(false);
    });

    it('disables credentials even when no visitor token is present', async () => {
      withUrlSpy.mockClear();
      const noTokenClient = new ConversationRealtimeClient();
      await noTokenClient.connect('https://api.test.com', 'conv-4', null, {
        onMessage: () => undefined,
      });

      const options = withUrlSpy.mock.calls[0][1] as { withCredentials?: boolean } | undefined;
      expect(options?.withCredentials).toBe(false);
      await noTokenClient.disconnect();
    });
  });
});
