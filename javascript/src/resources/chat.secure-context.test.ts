import { describe, it, expect, vi } from 'vitest';
import { ChatResource } from './chat';
import type { ErghiClient } from '../client';

function makeClient() {
  const http = {
    post: vi.fn().mockResolvedValue({ data: { id: 'conv-1', visitorToken: 'vt-1' } }),
    put: vi.fn().mockResolvedValue({ data: { expiresAt: '2026-10-05T10:00:00Z', keys: ['mf_access_token'] } }),
    delete: vi.fn().mockResolvedValue({ data: undefined }),
  };
  const client = {
    getHttpClient: () => http,
    getVisitorId: () => 'visitor-1',
  } as unknown as ErghiClient;
  return { http, chat: new ChatResource(client) };
}

describe('ChatResource identity token and secure context', () => {
  it('sends the identity token on conversation create and returns the visitor token', async () => {
    const { http, chat } = makeClient();
    const conv = await chat.createConversation('w-1', { plan: 'gold' }, { identityToken: 'jwt' });
    expect(http.post).toHaveBeenCalledWith('/api/conversations', {
      widgetId: 'w-1',
      metadata: { plan: 'gold' },
      visitorId: 'visitor-1',
      identityToken: 'jwt',
    });
    expect(conv.visitorToken).toBe('vt-1');
  });

  it('omits identityToken when not given', async () => {
    const { http, chat } = makeClient();
    await chat.createConversation('w-1');
    expect(http.post.mock.calls[0][1]).not.toHaveProperty('identityToken');
  });

  it('attaches an identity token with the visitor token header', async () => {
    const { http, chat } = makeClient();
    await chat.attachIdentityToken('conv-1', 'vt-1', 'jwt');
    expect(http.post).toHaveBeenCalledWith(
      '/api/conversations/conv-1/identity-token',
      { identityToken: 'jwt' },
      { headers: { 'X-Visitor-Token': 'vt-1' } }
    );
  });

  it('puts secure context, merging by default', async () => {
    const { http, chat } = makeClient();
    const result = await chat.setSecureContext('conv-1', 'vt-1', { mf_access_token: 'abc' }, { ttlSeconds: 900 });
    expect(http.put).toHaveBeenCalledWith(
      '/api/conversations/conv-1/secure-context',
      { values: { mf_access_token: 'abc' }, ttlSeconds: 900, merge: true },
      { headers: { 'X-Visitor-Token': 'vt-1' } }
    );
    expect(result.keys).toEqual(['mf_access_token']);
  });

  it('can replace instead of merge, and clear', async () => {
    const { http, chat } = makeClient();
    await chat.setSecureContext('conv-1', 'vt-1', { a: 'b' }, { merge: false });
    expect(http.put.mock.calls[0][1]).toMatchObject({ merge: false });
    await chat.clearSecureContext('conv-1', 'vt-1');
    expect(http.delete).toHaveBeenCalledWith(
      '/api/conversations/conv-1/secure-context',
      { headers: { 'X-Visitor-Token': 'vt-1' } }
    );
  });
});
