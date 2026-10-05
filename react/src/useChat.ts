import { useState, useCallback, useEffect } from 'react';
import { useErghi } from './context';
import type { Message, SendMessageRequest, PaginationParams } from '@erghi-ai/sdk';

/** Visitor-hub methods added in @erghi-ai/sdk 1.1. Feature-detected so this hook still
 * builds and runs against an older 1.x client, which falls back to the agent hub. */
interface VisitorHubClient {
  getVisitorToken(conversationId: string): string | undefined;
  connectVisitor(conversationId: string): Promise<void>;
  disconnectVisitor(): Promise<void>;
}

function asVisitorHubClient(client: object): VisitorHubClient | null {
  const c = client as Partial<VisitorHubClient>;
  return typeof c.getVisitorToken === 'function'
    && typeof c.connectVisitor === 'function'
    && typeof c.disconnectVisitor === 'function'
    ? (c as VisitorHubClient)
    : null;
}

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
    const visitorClient = asVisitorHubClient(client);
    const isVisitor = Boolean(visitorClient?.getVisitorToken(conversationId));

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

    if (visitorClient && isVisitor) {
      visitorClient.connectVisitor(conversationId).catch((err: unknown) => {
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
      if (visitorClient && isVisitor) {
        void visitorClient.disconnectVisitor();
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
