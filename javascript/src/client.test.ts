import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Verifies the client is wired to the REAL SignalR hub method/event names
// (SendTyping, MessageReceived, ...) that Erghi.Conversation/Api/Hubs/ChatHub.cs actually
// exposes, not the old ad-hoc {type, data} envelope a raw WebSocket used to send into the
// void. Mocks @microsoft/signalr's connection object directly rather than running a real
// hub, since the point under test is "does this client call the right hub methods and listen
// for the right hub events," not "does @microsoft/signalr itself work."
const mockHubConnection = {
  state: 'Disconnected',
  on: vi.fn(),
  onreconnecting: vi.fn(),
  onreconnected: vi.fn(),
  onclose: vi.fn(),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  invoke: vi.fn().mockResolvedValue(undefined),
};

const withUrlMock = vi.fn().mockReturnThis();
const withAutomaticReconnectMock = vi.fn().mockReturnThis();
const buildMock = vi.fn(() => mockHubConnection);

vi.mock('@microsoft/signalr', () => {
  return {
    HubConnectionBuilder: vi.fn().mockImplementation(() => ({
      withUrl: withUrlMock,
      withAutomaticReconnect: withAutomaticReconnectMock,
      build: buildMock,
    })),
    HubConnectionState: {
      Disconnected: 'Disconnected',
      Connected: 'Connected',
      Connecting: 'Connecting',
      Reconnecting: 'Reconnecting',
      Disconnecting: 'Disconnecting',
    },
  };
});

import { ErghiClient } from './client';

describe('ErghiClient real-time transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHubConnection.state = 'Disconnected';
  });

  it('connects to the real ChatHub path with an access token factory', () => {
    const client = new ErghiClient({ wsUrl: 'ws://localhost:5002', accessToken: 'test-token' });
    client.connect();

    expect(withUrlMock).toHaveBeenCalledWith(
      'ws://localhost:5002/hubs/chat',
      expect.objectContaining({ accessTokenFactory: expect.any(Function) })
    );
    expect(mockHubConnection.start).toHaveBeenCalled();
  });

  it('subscribes to the real hub event names and re-emits them under the SDK\'s public dotted names', () => {
    const client = new ErghiClient();
    client.connect();

    const onCalls = mockHubConnection.on.mock.calls.map((c) => c[0]);
    expect(onCalls).toEqual(
      expect.arrayContaining(['MessageReceived', 'MessageRead', 'UserTyping', 'ConversationClosed', 'ConversationAssigned'])
    );

    const messageReceivedHandler = mockHubConnection.on.mock.calls.find(
      (c) => c[0] === 'MessageReceived'
    )?.[1];
    const received: any[] = [];
    client.on('message.received', (data) => received.push(data));

    messageReceivedHandler({ id: 'msg-1', content: 'hello' });

    expect(received).toEqual([{ id: 'msg-1', content: 'hello' }]);
  });

  it('send("user.typing", ...) invokes the real SendTyping hub method', () => {
    const client = new ErghiClient();
    client.connect();
    mockHubConnection.state = 'Connected';

    client.send('user.typing', { conversationId: 'conv-1' });

    expect(mockHubConnection.invoke).toHaveBeenCalledWith('SendTyping', 'conv-1');
  });

  it('rejects an unsupported event type instead of silently sending it nowhere', () => {
    const client = new ErghiClient();
    client.connect();
    mockHubConnection.state = 'Connected';

    expect(() => client.send('made.up.type', {})).toThrow(/Unsupported real-time event type/);
  });

  it('joinConversation invokes the real JoinConversation hub method', () => {
    const client = new ErghiClient();
    client.connect();
    mockHubConnection.state = 'Connected';

    client.joinConversation('conv-42');

    expect(mockHubConnection.invoke).toHaveBeenCalledWith('JoinConversation', 'conv-42');
  });

  it('disconnect() stops the hub connection', () => {
    const client = new ErghiClient();
    client.connect();
    client.disconnect();

    expect(mockHubConnection.stop).toHaveBeenCalled();
  });

  it('connects to the visitor hub with the conversation\'s visitor token and no credentials', async () => {
    const client = new ErghiClient({ apiUrl: 'https://api.example.test/' });
    client.setVisitorToken('conv 1', 'vt/1');
    await client.connectVisitor('conv 1');

    expect(withUrlMock).toHaveBeenCalledWith(
      'https://api.example.test/hubs/visitor?conversationId=conv%201&visitorToken=vt%2F1',
      { withCredentials: false }
    );
    const events = mockHubConnection.on.mock.calls.map((c) => c[0]);
    expect(events).toEqual(expect.arrayContaining(['MessageReceived', 'ContextRequired', 'ConversationClosed']));
  });

  it('re-emits ContextRequired from the visitor hub as context.required', async () => {
    const client = new ErghiClient({ apiUrl: 'https://api.example.test' });
    client.setVisitorToken('conv-1', 'vt-1');
    const seen = vi.fn();
    client.on('context.required', seen);
    await client.connectVisitor('conv-1');

    const handler = mockHubConnection.on.mock.calls.find((c) => c[0] === 'ContextRequired')![1];
    handler(undefined);
    expect(seen).toHaveBeenCalledWith({ conversationId: 'conv-1' });
  });

  it('refuses a visitor connection without a visitor token', async () => {
    const client = new ErghiClient({ apiUrl: 'https://api.example.test' });
    await expect(client.connectVisitor('conv-1')).rejects.toMatchObject({ code: 'VISITOR_TOKEN_MISSING' });
    expect(withUrlMock).not.toHaveBeenCalled();
  });

  describe('resuming a suspended webview', () => {
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    let page: EventTarget;

    beforeEach(() => {
      page = new EventTarget();
      vi.stubGlobal('window', page);
      vi.stubGlobal('document', Object.assign(page, { visibilityState: 'visible' }));
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const connected = async () => {
      const client = new ErghiClient({ apiUrl: 'https://api.example.test' });
      client.setVisitorToken('conv-1', 'vt-1');
      await client.connectVisitor('conv-1');
      mockHubConnection.start.mockClear();
      return client;
    };

    it('restarts a closed visitor hub on visibilitychange and emits conversation.resumed', async () => {
      const client = await connected();
      const resumed = vi.fn();
      client.on('conversation.resumed', resumed);
      mockHubConnection.state = 'Disconnected';
      page.dispatchEvent(new Event('visibilitychange'));
      await flush();
      expect(mockHubConnection.start).toHaveBeenCalledTimes(1);
      expect(resumed).toHaveBeenCalledWith({ conversationId: 'conv-1' });
    });

    it('leaves a live hub alone but still emits conversation.resumed', async () => {
      const client = await connected();
      const resumed = vi.fn();
      client.on('conversation.resumed', resumed);
      mockHubConnection.state = 'Connected';
      page.dispatchEvent(new Event('online'));
      await flush();
      expect(mockHubConnection.start).not.toHaveBeenCalled();
      expect(resumed).toHaveBeenCalledTimes(1);
    });

    it('stops listening after disconnectVisitor', async () => {
      const client = await connected();
      const resumed = vi.fn();
      client.on('conversation.resumed', resumed);
      await client.disconnectVisitor();
      page.dispatchEvent(new Event('pageshow'));
      await flush();
      expect(resumed).not.toHaveBeenCalled();
    });
  });
});
