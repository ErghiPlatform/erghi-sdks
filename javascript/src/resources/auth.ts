import { ErghiClient } from '../client';
import {
  User,
  RegisterRequest,
  LoginRequest,
  AuthResponse,
} from '../types';

/**
 * Authentication resource
 */
export class AuthResource {
  constructor(private client: ErghiClient) {}

  /**
   * Register a new user
   */
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await this.client.getHttpClient().post<AuthResponse>('/api/auth/register', data);
    
    // Store access token
    this.client.setAccessToken(response.data.accessToken);
    
    return response.data;
  }

  /**
   * Login with email and password
   */
  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await this.client.getHttpClient().post<AuthResponse>('/api/auth/login', data);
    
    // Store access token
    this.client.setAccessToken(response.data.accessToken);
    
    return response.data;
  }

  /**
   * Refresh access token
   */
  async refresh(refreshToken: string): Promise<AuthResponse> {
    const response = await this.client.getHttpClient().post<AuthResponse>('/api/auth/refresh', {
      refreshToken,
    });
    
    // Store new access token
    this.client.setAccessToken(response.data.accessToken);
    
    return response.data;
  }

  /**
   * Logout (revoke refresh token)
   */
  async logout(): Promise<void> {
    await this.client.getHttpClient().post('/api/auth/logout');
    this.client.setAccessToken('');
  }

  /**
   * Get current authenticated user
   */
  async me(): Promise<User> {
    const response = await this.client.getHttpClient().get<User>('/api/auth/me');
    return response.data;
  }

  /**
   * Verify email with token
   */
  async verifyEmail(token: string): Promise<void> {
    await this.client.getHttpClient().post('/api/auth/verify-email', { token });
  }

  /**
   * Request password reset
   */
  async forgotPassword(email: string): Promise<void> {
    await this.client.getHttpClient().post('/api/auth/forgot-password', { email });
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.client.getHttpClient().post('/api/auth/reset-password', {
      token,
      newPassword,
    });
  }
}
