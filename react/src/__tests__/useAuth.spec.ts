import { vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth } from '../useAuth';
import { useErghi } from '../context';

vi.mock('../context');

describe('useAuth', () => {
  const mockLogin = vi.fn();
  const mockRegister = vi.fn();
  const mockLogout = vi.fn();
  const mockAuthenticateVisitor = vi.fn();

  const mockClient = {
    auth: {
      login: mockLogin,
      register: mockRegister,
      logout: mockLogout
    },
    authenticateVisitor: mockAuthenticateVisitor
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useErghi as vi.Mock).mockReturnValue({
      client: mockClient,
      user: null,
      isAuthenticated: false,
      isLoading: false
    });
  });

  it('provides initial state from context', () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  describe('login', () => {
    it('calls client.auth.login and handles success', async () => {
      const mockResponse = { accessToken: 'token', user: { id: '1' } };
      mockLogin.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuth());

      let res;
      await act(async () => {
        res = await result.current.login({ email: 'test@test.com', password: 'password' });
      });

      expect(mockLogin).toHaveBeenCalledWith({ email: 'test@test.com', password: 'password' });
      expect(res).toEqual(mockResponse);
      expect(result.current.error).toBeNull();
    });

    it('handles failure', async () => {
      const error = new Error('Login failed error');
      mockLogin.mockRejectedValue(error);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await expect(result.current.login({ email: 'test@test.com', password: 'password' }))
          .rejects.toThrow('Login failed error');
      });

      expect(result.current.error).toEqual(error);
    });
  });

  describe('register', () => {
    it('calls client.auth.register', async () => {
      const mockResponse = { accessToken: 'token', user: { id: '1' } };
      mockRegister.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useAuth());

      let res;
      await act(async () => {
        res = await result.current.register({ email: 'test@test.com', password: 'password', firstName: 'John', lastName: 'Doe' });
      });

      expect(mockRegister).toHaveBeenCalledWith({ email: 'test@test.com', password: 'password', firstName: 'John', lastName: 'Doe' });
      expect(res).toEqual(mockResponse);
    });
  });

  describe('logout', () => {
    it('calls client.auth.logout', async () => {
      mockLogout.mockResolvedValue(undefined);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.logout();
      });

      expect(mockLogout).toHaveBeenCalled();
    });
  });

  describe('authenticateVisitor', () => {
    it('calls client.authenticateVisitor', async () => {
      mockAuthenticateVisitor.mockResolvedValue('visitor-token');

      const { result } = renderHook(() => useAuth());

      let res;
      await act(async () => {
        res = await result.current.authenticateVisitor('widget-1', 'jwt-token');
      });

      expect(mockAuthenticateVisitor).toHaveBeenCalledWith('widget-1', 'jwt-token');
      expect(res).toEqual('visitor-token');
    });
  });
});
