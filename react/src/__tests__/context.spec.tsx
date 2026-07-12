import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ErghiProvider, useErghi } from '../context';
import ErghiClient from '@erghi/sdk';

jest.mock('@erghi/sdk');

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
    jest.clearAllMocks();
  });

  it('throws error when useErghi is used outside provider', () => {
    const originalError = console.error;
    console.error = jest.fn(); // Suppress React error boundary log
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
    
    const mockMe = jest.fn().mockResolvedValue(mockUser);
    (ErghiClient as unknown as jest.Mock).mockImplementation(() => ({
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
    const mockMe = jest.fn().mockRejectedValue(new Error('Invalid token'));
    (ErghiClient as unknown as jest.Mock).mockImplementation(() => ({
      auth: { me: mockMe }
    }));

    const originalError = console.error;
    console.error = jest.fn();

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
