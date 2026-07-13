import { vi } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ErghiProvider, useErghi } from '../context';
import ErghiClient from '@erghi/sdk';

vi.mock('@erghi/sdk', () => {
  const mockClient = vi.fn();
  return {
    default: mockClient,
    ErghiClient: mockClient,
  };
});

const TestComponent = () => {
  const { client, user, isAuthenticated, isLoading } = useErghi();
  return (
    <div>
      <span data-testid="is-loading">{isLoading.toString()}</span>
      <span data-testid="is-auth">{isAuthenticated.toString()}</span>
      <span data-testid="user-id">{user?.id || 'none'}</span>
    </div>
  );
};

describe('ErghiProvider', () => {
  const mockConfig = { apiUrl: 'http://test.local', widgetId: 'test-widget' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws error when useErghi is used outside provider', () => {
    const originalError = console.error;
    console.error = vi.fn(); // Suppress React error boundary log
    expect(() => render(<TestComponent />)).toThrow('useErghi must be used within ErghiProvider');
    console.error = originalError;
  });

  it('provides unauthenticated state when no access token is given', () => {
    render(
      <ErghiProvider config={mockConfig}>
        <TestComponent />
      </ErghiProvider>
    );

    expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    expect(screen.getByTestId('is-auth')).toHaveTextContent('false');
    expect(screen.getByTestId('user-id')).toHaveTextContent('none');
  });

  it('provides authenticated state when user is fetched successfully', async () => {
    const mockUser = { id: 'usr-123', email: 'test@test.com' };
    
    const mockMe = vi.fn().mockResolvedValue(mockUser);
    (ErghiClient as unknown as vi.Mock).mockImplementation(() => ({
      auth: { me: mockMe }
    }));

    render(
      <ErghiProvider config={{ ...mockConfig, accessToken: 'valid-token' }}>
        <TestComponent />
      </ErghiProvider>
    );

    expect(screen.getByTestId('is-loading')).toHaveTextContent('true');
    
    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    });

    expect(mockMe).toHaveBeenCalled();
    expect(screen.getByTestId('is-auth')).toHaveTextContent('true');
    expect(screen.getByTestId('user-id')).toHaveTextContent('usr-123');
  });

  it('handles auth fetch failure gracefully', async () => {
    const mockMe = vi.fn().mockRejectedValue(new Error('Invalid token'));
    (ErghiClient as unknown as vi.Mock).mockImplementation(() => ({
      auth: { me: mockMe }
    }));

    const originalError = console.error;
    console.error = vi.fn();

    render(
      <ErghiProvider config={{ ...mockConfig, accessToken: 'invalid-token' }}>
        <TestComponent />
      </ErghiProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    });

    expect(mockMe).toHaveBeenCalled();
    expect(screen.getByTestId('is-auth')).toHaveTextContent('false');
    expect(console.error).toHaveBeenCalledWith('Failed to load user:', expect.any(Error));

    console.error = originalError;
  });
});
