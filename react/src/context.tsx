import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import ErghiClient from '@erghi/sdk';
import type { ErghiConfig, User, AuthResponse } from '@erghi/sdk';

interface ErghiContextValue {
  client: ErghiClient;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const ErghiContext = createContext<ErghiContextValue | null>(null);

interface ErghiProviderProps {
  config: ErghiConfig;
  children: ReactNode;
}

export function ErghiProvider({ config, children }: ErghiProviderProps) {
  const [client] = useState(() => new ErghiClient(config));
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

  const value: ErghiContextValue = {
    client,
    user,
    isAuthenticated: !!user,
    isLoading,
  };

  return (
    <ErghiContext.Provider value={value}>
      {children}
    </ErghiContext.Provider>
  );
}

export function useErghi() {
  const context = useContext(ErghiContext);
  if (!context) {
    throw new Error('useErghi must be used within ErghiProvider');
  }
  return context;
}
