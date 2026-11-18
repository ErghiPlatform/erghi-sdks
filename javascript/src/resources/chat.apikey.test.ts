import { describe, it, expect, vi } from 'vitest';
import { ChatResource } from './chat';
import type { ErghiClient } from '../client';

function makeClient(clientCredentials: boolean, visitorTokens: Record<string, string> = {}) {
  const http = {
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
    post: vi.fn().mockResolvedValue({ data: { id: 'm-1' } }),
  };
  const client = {
    getHttpClient: () => http,
    usesClientCredentials: () => clientCredentials,
    getVisitorToken: (id: string) => visitorTokens[id],
    getVisitorId: () => '',
    setVisitorToken: () => undefined,
  } as unknown as ErghiClient;
  return { http, chat: new ChatResource(client) };
}

describe('ChatResource with an API key (client credentials)', () => {
  it('lists, reads, replies and closes through the key-scoped endpoints', async () => {
    const { http, chat } = makeClient(true);
    await chat.listConversations({ page: 1, limit: 5 });
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/agent/conversations', { params: { page: 1, limit: 5 } });

    await chat.getConversation('c1');
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/agent/conversations/c1', { headers: {} });

    await chat.getMessages('c1');
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/agent/conversations/c1/messages', { params: undefined, headers: {} });

    await chat.sendMessage({ conversationId: 'c1', content: 'hi' });
    expect(http.post).toHaveBeenLastCalledWith(
      '/api/v1/agent/conversations/c1/messages',
      { content: 'hi', type: 'text', attachments: undefined },
      { headers: {} }
    );

    await chat.closeConversation('c1');
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/agent/conversations/c1/close');
  });

  it('refuses attachments instead of silently dropping them', async () => {
    const { chat } = makeClient(true);
    await expect(
      chat.sendMessage({ conversationId: 'c1', content: 'x', attachments: [new Blob(['a'])] })
    ).rejects.toMatchObject({ code: 'ATTACHMENTS_NOT_SUPPORTED_FOR_API_KEYS' });
  });

  it('a visitor token keeps the visitor endpoints even on a key client', async () => {
    const { http, chat } = makeClient(true, { c1: 'vt' });
    await chat.getMessages('c1');
    expect(http.get).toHaveBeenLastCalledWith('/api/conversations/c1/messages', {
      params: undefined,
      headers: { 'X-Visitor-Token': 'vt' },
    });
  });

  it('a teammate token client keeps the /api/conversations endpoints', async () => {
    const { http, chat } = makeClient(false);
    await chat.listConversations();
    expect(http.get).toHaveBeenLastCalledWith('/api/conversations', { params: undefined });
  });
});
