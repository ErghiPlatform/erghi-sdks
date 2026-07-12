import { useState, useCallback, useEffect } from 'react';
import { useErghi } from './context';
import type { Message, SendMessageRequest, PaginationParams } from '@erghi/sdk';

export function useChat(conversationId: string) {
  const { client } = useErghi();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Load initial messages
  useEffect(() => {
    const loadMessages = async () => {
      setIsLoading(true);
      try {
        const response = await client.chat.getMessages(conversationId, {
          page: 1,
          limit: 50,
          sort: 'createdAt',
          order: 'asc',
        } as PaginationParams);
        setMessages(response.data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load messages'));
      } finally {
        setIsLoading(false);
      }
    };

    loadMessages();
  }, [client, conversationId]);

  // Setup WebSocket
  useEffect(() => {
    client.connect();
    setIsConnected(true);

    const handleMessage = (data: Message) => {
      if (data.conversationId === conversationId) {
        setMessages((prev) => [...prev, data]);
      }
    };

    client.on('message.received', handleMessage);

    return () => {
      client.off('message.received', handleMessage);
      client.disconnect();
      setIsConnected(false);
    };
  }, [client, conversationId]);

  const sendMessage = useCallback(async (content: string, type: string = 'text') => {
    setError(null);
    
    try {
      const message = await client.chat.sendMessage({
        conversationId,
        content,
        type,
      } as SendMessageRequest);
      
      setMessages((prev) => [...prev, message]);
      return message;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to send message');
      setError(error);
      throw error;
    }
  }, [client, conversationId]);

  const sendTyping = useCallback(() => {
    client.chat.sendTyping(conversationId);
  }, [client, conversationId]);

  return {
    messages,
    isLoading,
    error,
    isConnected,
    sendMessage,
    sendTyping,
  };
}
