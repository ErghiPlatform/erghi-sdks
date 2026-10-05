import { describe, it, expect, vi } from 'vitest';
import { ChatResource } from './chat';
import type { ErghiClient } from '../client';

function makeClient() {
  const http = {
    get: vi.fn().mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 50, totalPages: 0 } }),
    post: vi.fn().mockResolvedValue({ data: { id: 'conv-1', visitorToken: 'vt-1' } }),
    put: vi.fn().mockResolvedValue({ data: { expiresAt: '2026-10-05T10:00:00Z', keys: ['mf_access_token'] } }),
    delete: vi.fn().mockResolvedValue({ data: undefined }),
  };
  const tokens = new Map<string, string>();
  const client = {
    getHttpClient: () => http,
    getVisitorId: () => 'visitor-1',
    setVisitorToken: (id: string, t: string) => tokens.set(id, t),
    getVisitorToken: (id: string) => tokens.get(id),
  } as unknown as ErghiClient;
  return { http, tokens, chat: new ChatResource(client) };
}

const VT = { headers: { 'X-Visitor-Token': 'vt-1' } };

describe('ChatResource visitor calls', () => {
  it('sends the identity token on create and remembers the visitor token', async () => {
    const { http, tokens, chat } = makeClient();
    const conv = await chat.createConversation('w-1', { plan: 'gold' }, { identityToken: 'jwt' });
    expect(http.post).toHaveBeenCalledWith('/api/conversations', {
      widgetId: 'w-1',
      metadata: { plan: 'gold' },
      visitorId: 'visitor-1',
      identityToken: 'jwt',
    });
    expect(conv.visitorToken).toBe('vt-1');
    expect(tokens.get('conv-1')).toBe('vt-1');
  });

  it('omits identityToken when not given', async () => {
    const { http, chat } = makeClient();
    await chat.createConversation('w-1');
    expect(http.post.mock.calls[0][1]).not.toHaveProperty('identityToken');
  });

  it('attaches an identity token with the stored visitor token', async () => {
    const { http, tokens, chat } = makeClient();
    tokens.set('conv-1', 'vt-1');
    await chat.attachIdentityToken('conv-1', 'jwt');
    expect(http.post).toHaveBeenCalledWith('/api/conversations/conv-1/identity-token', { identityToken: 'jwt' }, VT);
  });

  it('puts secure context, merging by default, and clears it', async () => {
    const { http, tokens, chat } = makeClient();
    tokens.set('conv-1', 'vt-1');
    const result = await chat.setSecureContext('conv-1', { mf_access_token: 'abc' }, { ttlSeconds: 900 });
    expect(http.put).toHaveBeenCalledWith(
      '/api/conversations/conv-1/secure-context',
      { values: { mf_access_token: 'abc' }, ttlSeconds: 900, merge: true },
      VT
    );
    expect(result.keys).toEqual(['mf_access_token']);
    await chat.setSecureContext('conv-1', { a: 'b' }, { merge: false });
    expect(http.put.mock.calls[1][1]).toMatchObject({ merge: false });
    await chat.clearSecureContext('conv-1');
    expect(http.delete).toHaveBeenCalledWith('/api/conversations/conv-1/secure-context', VT);
  });

  it('refuses identity and secure-context calls without a visitor token', async () => {
    const { http, chat } = makeClient();
    await expect(chat.setSecureContext('conv-1', { a: 'b' })).rejects.toMatchObject({ code: 'VISITOR_TOKEN_MISSING' });
    await expect(chat.attachIdentityToken('conv-1', 'jwt')).rejects.toMatchObject({ code: 'VISITOR_TOKEN_MISSING' });
    expect(http.put).not.toHaveBeenCalled();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('sends a message as JSON with the visitor token', async () => {
    const { http, tokens, chat } = makeClient();
    tokens.set('conv-1', 'vt-1');
    await chat.sendMessage({ conversationId: 'conv-1', content: 'hi' });
    expect(http.post).toHaveBeenCalledWith(
      '/api/conversations/conv-1/messages',
      { content: 'hi', type: 'text', attachments: undefined },
      VT
    );
  });

  it('uploads attachments first, then references them in the message', async () => {
    const { http, tokens, chat } = makeClient();
    tokens.set('conv-1', 'vt-1');
    const uploaded = { id: 'a-1', filename: 'r.pdf', contentType: 'application/pdf', size: 3, url: 'https://x/a-1' };
    http.post.mockResolvedValueOnce({ data: uploaded }).mockResolvedValueOnce({ data: { id: 'm-1' } });
    const file = new File(['abc'], 'r.pdf', { type: 'application/pdf' });

    await chat.sendMessage({ conversationId: 'conv-1', content: 'see file', attachments: [file] });

    const [url, form, config] = http.post.mock.calls[0];
    expect(url).toBe('/api/conversations/conv-1/attachments');
    expect((form as FormData).get('file')).toBeInstanceOf(Blob);
    expect(config).toEqual(VT);
    expect(http.post.mock.calls[1][1]).toEqual({ content: 'see file', type: 'text', attachments: [uploaded] });
  });

  it('reads messages and the conversation with the visitor token', async () => {
    const { http, tokens, chat } = makeClient();
    tokens.set('conv-1', 'vt-1');
    await chat.getMessages('conv-1', { page: 1 });
    expect(http.get).toHaveBeenCalledWith('/api/conversations/conv-1/messages', { params: { page: 1 }, ...VT });
    await chat.getConversation('conv-1');
    expect(http.get).toHaveBeenLastCalledWith('/api/conversations/conv-1', VT);
  });

  it('sends no visitor header for operator calls', async () => {
    const { http, chat } = makeClient();
    await chat.getMessages('conv-9');
    expect(http.get).toHaveBeenCalledWith('/api/conversations/conv-9/messages', { params: undefined, headers: {} });
  });
});
