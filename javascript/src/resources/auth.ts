import { ErghiClient } from '../client';
import {
  User,
  RegisterRequest,
  LoginRequest,
  AuthResponse,
} from '../types';
import { AuthenticationError } from '../errors';

/**
 * Raw GoTrue user, as returned by the platform's auth server (snake_case).
 * The gateway forwards `/api/auth/*` to GoTrue unchanged, so these are the
 * real wire shapes; {@link toUser} / {@link toAuthResponse} map them onto the
 * SDK's public camelCase types.
 */
interface GoTrueUser {
  id: string;
  email?: string;
  role?: string;
  email_confirmed_at?: string | null;
  created_at?: string;
  last_sign_in_at?: string | null;
  factors?: unknown[] | null;
  user_metadata?: Record<string, unknown> | null;
}

interface GoTrueSession {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user?: GoTrueUser;
}

function metadataString(user: GoTrueUser, key: string): string | undefined {
  const value = user.user_metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

export function toUser(user: GoTrueUser): User {
  return {
    id: user.id,
    email: user.email ?? '',
    firstName: metadataString(user, 'first_name'),
    lastName: metadataString(user, 'last_name'),
    avatar: metadataString(user, 'avatar_url'),
    role: user.role ?? 'authenticated',
    emailVerified: Boolean(user.email_confirmed_at),
    twoFactorEnabled: Array.isArray(user.factors) && user.factors.length > 0,
    createdAt: user.created_at ?? '',
    lastLoginAt: user.last_sign_in_at ?? undefined,
  };
}

/**
 * Map a GoTrue response onto {@link AuthResponse}. `/signup` returns a bare
 * user (no session) while email confirmation is pending; tokens are then
 * empty strings and the client's token is left untouched.
 */
export function toAuthResponse(body: GoTrueSession | GoTrueUser): AuthResponse {
  const session = body as GoTrueSession;
  const user = session.user ?? (body as GoTrueUser);
  return {
    accessToken: session.access_token ?? '',
    refreshToken: session.refresh_token ?? '',
    expiresIn: session.expires_in ?? 0,
    tokenType: session.token_type ?? 'bearer',
    user: toUser(user),
  };
}

/**
 * Authentication resource (email/password users, backed by GoTrue).
 * Server-to-server integrations should use API keys
 * (`clientId`/`clientSecret`) instead.
 */
export class AuthResource {
  constructor(private client: ErghiClient) {}

  /**
   * Register a new user. When the platform requires email confirmation the
   * returned tokens are empty until the user confirms (see {@link verifyEmail}).
   */
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await this.client.getHttpClient().post<GoTrueSession | GoTrueUser>(
      '/api/auth/register',
      {
        email: data.email,
        password: data.password,
        data: { first_name: data.firstName, last_name: data.lastName },
      }
    );
    return this.store(toAuthResponse(response.data));
  }

  /**
   * Login with email and password
   */
  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await this.client.getHttpClient().post<GoTrueSession>('/api/auth/login', {
      email: data.email,
      password: data.password,
    });
    return this.store(toAuthResponse(response.data));
  }

  /**
   * Exchange a refresh token for a new session
   */
  async refresh(refreshToken: string): Promise<AuthResponse> {
    const response = await this.client.getHttpClient().post<GoTrueSession>(
      '/api/auth/token',
      { refresh_token: refreshToken },
      { params: { grant_type: 'refresh_token' } }
    );
    return this.store(toAuthResponse(response.data));
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
    const response = await this.client.getHttpClient().get<GoTrueUser>('/api/auth/user');
    return toUser(response.data);
  }

  /**
   * Confirm a signup with the token from the confirmation email link.
   */
  async verifyEmail(token: string): Promise<void> {
    const response = await this.client.getHttpClient().post<GoTrueSession>('/api/auth/verify', {
      type: 'signup',
      token_hash: token,
    });
    this.store(toAuthResponse(response.data));
  }

  /**
   * Send a password reset email
   */
  async forgotPassword(email: string): Promise<void> {
    await this.client.getHttpClient().post('/api/auth/recover', { email });
  }

  /**
   * Set a new password using the token from the reset email link: the token is
   * exchanged for a recovery session, which is then used to update the password.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const http = this.client.getHttpClient();
    const verified = await http.post<GoTrueSession>('/api/auth/verify', {
      type: 'recovery',
      token_hash: token,
    });
    const recoveryToken = verified.data.access_token;
    if (!recoveryToken) {
      throw new AuthenticationError('Password reset token was not accepted');
    }
    await http.put(
      '/api/auth/user',
      { password: newPassword },
      { headers: { Authorization: `Bearer ${recoveryToken}` } }
    );
  }

  private store(auth: AuthResponse): AuthResponse {
    if (auth.accessToken) {
      this.client.setAccessToken(auth.accessToken);
    }
    return auth;
  }
}
