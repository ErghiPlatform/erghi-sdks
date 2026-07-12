import { useState, useCallback } from 'react';
import { useErghi } from './context';
import type { LoginRequest, RegisterRequest, AuthResponse } from '@erghi/sdk';

export function useAuth() {
  const { client, user, isAuthenticated, isLoading: contextLoading } = useErghi();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const login = useCallback(async (credentials: LoginRequest): Promise<AuthResponse> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await client.auth.login(credentials);
      return response;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Login failed');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  const register = useCallback(async (data: RegisterRequest): Promise<AuthResponse> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await client.auth.register(data);
      return response;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Registration failed');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    
    try {
      await client.auth.logout();
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Logout failed');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  const authenticateVisitor = useCallback(async (widgetId: string, jwtToken: string): Promise<string> => {
    setIsLoading(true);
    setError(null);

    try {
      return await client.authenticateVisitor(widgetId, jwtToken);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Visitor authentication failed');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  return {
    user,
    isAuthenticated,
    isLoading: contextLoading || isLoading,
    error,
    logout,
    authenticateVisitor,
  };
}
