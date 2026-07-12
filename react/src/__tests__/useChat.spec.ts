import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from '../useChat';
import { useErghi } from '../context';

jest.mock('../context');

describe('useChat', () => {
  const mockGetMessages = jest.fn();
  const mockSendMessage = jest.fn();
  const mockMarkAsRead = jest.fn();
  const mockConnect = jest.fn();
  const mockDisconnect = jest.fn();
  const mockOn = jest.fn();
  const mockOff = jest.fn();
  const mockSendTypingEvent = jest.fn();

  const mockClient = {
    chat: {
      getMessages: mockGetMessages,
      sendMessage: mockSendMessage,
      markAsRead: mockMarkAsRead,
      sendTypingEvent: mockSendTypingEvent,
    },
    connect: mockConnect,
    disconnect: mockDisconnect,
    on: mockOn,
    off: mockOff,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useErghi as jest.Mock).mockReturnValue({ client: mockClient });
  });

  it('loads initial messages on mount', async () => {
    const mockMessages = [{ id: '1', content: 'hello' }];
    mockGetMessages.mockResolvedValue({ data: mockMessages, meta: {} });

    const { result } = renderHook(() => useChat('conv-1'));

    expect(result.current.isLoading).toBe(true);
    expect(mockGetMessages).toHaveBeenCalledWith('conv-1', expect.any(Object));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    
    expect(result.current.messages).toEqual(mockMessages);
    expect(result.current.error).toBeNull();
  });

  it('sets error if loading messages fails', async () => {
    const error = new Error('Failed to load messages');
    mockGetMessages.mockRejectedValue(error);

    const { result } = renderHook(() => useChat('conv-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    
    expect(result.current.error).toEqual(error);
  });

  it('connects to websocket and listens for new messages on mount', async () => {
    mockGetMessages.mockResolvedValue({ data: [], meta: {} });
    
    const { unmount } = renderHook(() => useChat('conv-1'));
    
    expect(mockConnect).toHaveBeenCalled();
    expect(mockOn).toHaveBeenCalledWith('message.received', expect.any(Function));

    unmount();
    
    expect(mockOff).toHaveBeenCalledWith('message.received', expect.any(Function));
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('handles incoming messages via websocket', async () => {
    mockGetMessages.mockResolvedValue({ data: [{ id: '1', content: 'hello' }], meta: {} });
    
    let messageHandler: Function = () => {};
    mockOn.mockImplementation((event, handler) => {
      if (event === 'message.received') {
        messageHandler = handler;
      }
    });

    const { result } = renderHook(() => useChat('conv-1'));
    
    await waitFor(() => {
      expect(result.current.messages.length).toBe(1);
    });

    // Simulate incoming message
    act(() => {
      messageHandler({ id: '2', content: 'world', conversationId: 'conv-1' });
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].content).toBe('world');

    // Simulate message for different conversation
    act(() => {
      messageHandler({ id: '3', content: 'ignored', conversationId: 'conv-2' });
    });
    
    expect(result.current.messages).toHaveLength(2);
  });

  it('sends message successfully', async () => {
    mockGetMessages.mockResolvedValue({ data: [], meta: {} });
    const mockMessage = { id: '3', content: 'sent' };
    mockSendMessage.mockResolvedValue(mockMessage);

    const { result } = renderHook(() => useChat('conv-1'));

    await act(async () => {
      await result.current.sendMessage('sent');
    });

    expect(mockSendMessage).toHaveBeenCalledWith({ conversationId: 'conv-1', content: 'sent', type: 'text' });
  });
});
