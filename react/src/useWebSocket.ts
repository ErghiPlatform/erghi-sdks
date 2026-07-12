import { useState, useEffect, useCallback } from 'react';
import { useErghi } from './context';
import type { WebSocketEventType } from '@erghi/sdk';

export function useWebSocket() {
  const { client } = useErghi();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    client.on('connected', handleConnect);
    client.on('disconnected', handleDisconnect);

    return () => {
      client.off('connected', handleConnect);
      client.off('disconnected', handleDisconnect);
    };
  }, [client]);

  const connect = useCallback(() => {
    client.connect();
  }, [client]);

  const disconnect = useCallback(() => {
    client.disconnect();
  }, [client]);

  const subscribe = useCallback((event: WebSocketEventType, handler: (data: any) => void) => {
    client.on(event, handler);
    return () => client.off(event, handler);
  }, [client]);

  return {
    isConnected,
    connect,
    disconnect,
    subscribe,
  };
}
