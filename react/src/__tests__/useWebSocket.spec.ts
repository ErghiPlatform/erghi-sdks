import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../useWebSocket';
import { useErghi } from '../context';

jest.mock('../context');

describe('useWebSocket', () => {
  const mockConnect = jest.fn();
  const mockDisconnect = jest.fn();
  const mockOn = jest.fn();
  const mockOff = jest.fn();

  const mockClient = {
    connect: mockConnect,
    disconnect: mockDisconnect,
    on: mockOn,
    off: mockOff,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useErghi as jest.Mock).mockReturnValue({ client: mockClient });
  });

  it('sets up event listeners on mount and removes on unmount', () => {
    const { unmount } = renderHook(() => useWebSocket());

    expect(mockOn).toHaveBeenCalledWith('connected', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('disconnected', expect.any(Function));

    unmount();

    expect(mockOff).toHaveBeenCalledWith('connected', expect.any(Function));
    expect(mockOff).toHaveBeenCalledWith('disconnected', expect.any(Function));
  });

  it('updates isConnected state based on events', () => {
    let connectHandler: Function = () => {};
    let disconnectHandler: Function = () => {};

    mockOn.mockImplementation((event, handler) => {
      if (event === 'connected') connectHandler = handler;
      if (event === 'disconnected') disconnectHandler = handler;
    });

    const { result } = renderHook(() => useWebSocket());

    expect(result.current.isConnected).toBe(false);

    act(() => {
      connectHandler();
    });

    expect(result.current.isConnected).toBe(true);

    act(() => {
      disconnectHandler();
    });

    expect(result.current.isConnected).toBe(false);
  });

  it('exposes connect and disconnect methods', () => {
    const { result } = renderHook(() => useWebSocket());

    act(() => {
      result.current.connect();
    });
    expect(mockConnect).toHaveBeenCalled();

    act(() => {
      result.current.disconnect();
    });
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('exposes subscribe method that returns unsubscribe function', () => {
    const { result } = renderHook(() => useWebSocket());
    const handler = jest.fn();

    let unsubscribe: Function;
    act(() => {
      unsubscribe = result.current.subscribe('message.received', handler);
    });

    expect(mockOn).toHaveBeenCalledWith('message.received', handler);

    act(() => {
      unsubscribe();
    });

    expect(mockOff).toHaveBeenCalledWith('message.received', handler);
  });
});
