import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import AIChatClient from '@aichat/sdk';
import type { AIChatConfig, User, AuthResponse } from '@aichat/sdk';

interface AIChatContextValue {
  client: AIChatClient;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AIChatContext = createContext<AIChatContextValue | null>(null);

interface AIChatProviderProps {
  config: AIChatConfig;
  children: ReactNode;
}

export function AIChatProvider({ config, children }: AIChatProviderProps) {
  const [client] = useState(() => new AIChatClient(config));
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      if (config.accessToken) {
        try {
          const currentUser = await client.auth.me();
          setUser(currentUser);
        } catch (error) {
          console.error('Failed to load user:', error);
        }
      }
      setIsLoading(false);
    };

    loadUser();
  }, [client, config.accessToken]);

  const value: AIChatContextValue = {
    client,
    user,
    isAuthenticated: !!user,
    isLoading,
  };

  return (
    <AIChatContext.Provider value={value}>
      {children}
    </AIChatContext.Provider>
  );
}

export function useAIChat() {
  const context = useContext(AIChatContext);
  if (!context) {
    throw new Error('useAIChat must be used within AIChatProvider');
  }
  return context;
}
