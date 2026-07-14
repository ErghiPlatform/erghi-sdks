import { ConversationRealtimeClient, RealtimeMessage } from './realtime';

type SignalRCallback = (payload: unknown) => void;

const registeredHandlers = new Map<string, SignalRCallback>();

jest.mock('@microsoft/signalr', () => ({
  HubConnectionBuilder: jest.fn().mockImplementation(() => ({
    withUrl: jest.fn().mockReturnThis(),
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
    received = [];
    client = new ConversationRealtimeClient();
    await client.connect('https://api.test.com', 'conv-1', {
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
});
