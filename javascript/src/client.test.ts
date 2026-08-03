import { describe, it, expect, vi, beforeEach } from 'vitest';

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
});
