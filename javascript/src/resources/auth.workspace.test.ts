import { describe, it, expect, vi } from 'vitest';
import { AuthResource } from './auth';
import { WorkspaceResource } from './workspace';
import type { ErghiClient } from '../client';

const GOTRUE_SESSION = {
  access_token: 'at-1',
  refresh_token: 'rt-1',
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: 'u-1',
    email: 'qa@example.test',
    role: 'authenticated',
    email_confirmed_at: '2026-10-01T00:00:00Z',
    created_at: '2026-10-01T00:00:00Z',
    last_sign_in_at: '2026-10-12T00:00:00Z',
    user_metadata: { first_name: 'Q', last_name: 'A' },
  },
};

function makeClient(postData: unknown = GOTRUE_SESSION, getData: unknown = GOTRUE_SESSION.user) {
  const http = {
    get: vi.fn().mockResolvedValue({ data: getData }),
    post: vi.fn().mockResolvedValue({ data: postData }),
    put: vi.fn().mockResolvedValue({ data: {} }),
  };
  const state = { token: '', workspaceId: '' };
  const client = {
    getHttpClient: () => http,
    setAccessToken: (t: string) => { state.token = t; },
    setWorkspaceId: (id: string) => { state.workspaceId = id; },
  } as unknown as ErghiClient;
  return { http, state, auth: new AuthResource(client), workspace: new WorkspaceResource(client) };
}

describe('AuthResource GoTrue contract', () => {
  it('logs in with only email/password and maps the snake_case session', async () => {
    const { http, state, auth } = makeClient();
    const res = await auth.login({ email: 'qa@example.test', password: 'pw', twoFactorCode: '1' });
    expect(http.post).toHaveBeenCalledWith('/api/auth/login', { email: 'qa@example.test', password: 'pw' });
    expect(res.accessToken).toBe('at-1');
    expect(res.refreshToken).toBe('rt-1');
    expect(res.user).toMatchObject({ id: 'u-1', firstName: 'Q', emailVerified: true, lastLoginAt: '2026-10-12T00:00:00Z' });
    expect(state.token).toBe('at-1');
  });

  it('refreshes through the token grant', async () => {
    const { http, auth } = makeClient();
    await auth.refresh('rt-0');
    expect(http.post).toHaveBeenCalledWith(
      '/api/auth/token',
      { refresh_token: 'rt-0' },
      { params: { grant_type: 'refresh_token' } }
    );
  });

  it('register without a session keeps the current token', async () => {
    const { http, state, auth } = makeClient({ ...GOTRUE_SESSION.user, email_confirmed_at: null });
    const res = await auth.register({ email: 'qa@example.test', password: 'pw', firstName: 'Q' });
    expect(http.post.mock.calls[0][0]).toBe('/api/auth/register');
    expect(http.post.mock.calls[0][1]).toMatchObject({ data: { first_name: 'Q' } });
    expect(res.accessToken).toBe('');
    expect(res.user.emailVerified).toBe(false);
    expect(state.token).toBe('');
  });

  it('reads the profile from /user', async () => {
    const { http, auth } = makeClient();
    const user = await auth.me();
    expect(http.get).toHaveBeenCalledWith('/api/auth/user');
    expect(user.email).toBe('qa@example.test');
  });

  it('sends recovery mail via /recover', async () => {
    const { http, auth } = makeClient({});
    await auth.forgotPassword('qa@example.test');
    expect(http.post).toHaveBeenCalledWith('/api/auth/recover', { email: 'qa@example.test' });
  });

  it('resets the password with the recovery session token', async () => {
    const { http, auth } = makeClient({ access_token: 'recovery-at' });
    await auth.resetPassword('hash-1', 'new-pw');
    expect(http.post).toHaveBeenCalledWith('/api/auth/verify', { type: 'recovery', token_hash: 'hash-1' });
    expect(http.put).toHaveBeenCalledWith(
      '/api/auth/user',
      { password: 'new-pw' },
      { headers: { Authorization: 'Bearer recovery-at' } }
    );
  });

  it('rejects a reset token that yields no session', async () => {
    const { http, auth } = makeClient({});
    await expect(auth.resetPassword('bad', 'pw')).rejects.toThrow('not accepted');
    expect(http.put).not.toHaveBeenCalled();
  });
});

describe('WorkspaceResource account endpoints', () => {
  const ROWS = [
    { workspaceId: 'w-1', name: 'One', slug: 'one', isCurrent: true },
    { workspaceId: 'w-2', name: 'Two', slug: null, isCurrent: false },
  ];

  it('lists account workspaces', async () => {
    const { http, workspace } = makeClient({}, ROWS);
    const list = await workspace.list();
    expect(http.get).toHaveBeenCalledWith('/api/v1/accounts/workspaces');
    expect(list).toEqual([
      { id: 'w-1', name: 'One', slug: 'one', isCurrent: true },
      { id: 'w-2', name: 'Two', slug: '', isCurrent: false },
    ]);
  });

  it('gets one by id and 404s on a foreign id', async () => {
    const { workspace } = makeClient({}, ROWS);
    expect((await workspace.get('w-2')).name).toBe('Two');
    await expect(workspace.get('w-9')).rejects.toThrow('not found');
  });

  it('creates with the server field names and switches to it', async () => {
    const { http, state, workspace } = makeClient({ workspaceId: 'w-3', workspaceName: 'Three' });
    const ws = await workspace.create({ name: 'Three', companyWebsite: 'https://example.test' });
    expect(http.post).toHaveBeenCalledWith('/api/v1/accounts/workspaces', {
      workspaceName: 'Three',
      companyWebsite: 'https://example.test',
    });
    expect(ws.id).toBe('w-3');
    expect(state.workspaceId).toBe('w-3');
  });

  it('refuses update/delete instead of calling missing endpoints', async () => {
    const { http, workspace } = makeClient();
    await expect(workspace.update('w-1', { name: 'x' })).rejects.toThrow('not supported');
    await expect(workspace.delete('w-1')).rejects.toThrow('not supported');
    expect(http.put).not.toHaveBeenCalled();
  });
});
