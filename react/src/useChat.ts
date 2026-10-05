import { useState, useCallback, useEffect } from 'react';
import { useErghi } from './context';
import type { Message, SendMessageRequest, PaginationParams } from '@erghi-ai/sdk';

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

  // Real-time: an end user (the client holds this conversation's visitor token, set by
  // chat.createConversation or client.setVisitorToken) joins the visitor hub; an operator
  // (access token / API key) uses the agent hub.
  useEffect(() => {
    let active = true;
    const isVisitor = Boolean(client.getVisitorToken(conversationId));

    const handleMessage = (data: Message) => {
      if (data.conversationId === conversationId) {
        setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
      }
    };
    const handleConnected = () => active && setIsConnected(true);
    const handleDisconnected = () => active && setIsConnected(false);

    client.on('message.received', handleMessage);
    client.on('connected', handleConnected);
    client.on('disconnected', handleDisconnected);

    if (isVisitor) {
      client.connectVisitor(conversationId).catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err : new Error('Failed to connect'));
      });
    } else {
      client.connect();
    }

    return () => {
      active = false;
      client.off('message.received', handleMessage);
      client.off('connected', handleConnected);
      client.off('disconnected', handleDisconnected);
      if (isVisitor) {
        void client.disconnectVisitor();
      } else {
        client.disconnect();
      }
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
