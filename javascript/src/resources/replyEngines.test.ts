import { describe, it, expect, vi } from 'vitest';
import { ReplyEnginesResource, AgentRuntimeResource } from './replyEngines';
import { ErghiClient } from '../client';
import { ErghiApiError, NotFoundError } from '../errors';

function make() {
  const http = {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: undefined }),
    delete: vi.fn().mockResolvedValue({ data: undefined }),
  };
  const client = { getHttpClient: () => http } as unknown as ErghiClient;
  return { http, admin: new ReplyEnginesResource(client), runtime: new AgentRuntimeResource(client) };
}

describe('ReplyEnginesResource', () => {
  it('creates with camelCase and returns the one-time secret', async () => {
    const { http, admin } = make();
    http.post.mockResolvedValue({ data: { id: 'e1', secret: 'whsec_abc' } });
    const engine = await admin.create({ name: 'Bot', mode: 'Webhook', url: 'https://hook.test', timeoutSeconds: 20 });
    expect(http.post).toHaveBeenCalledWith('/api/v1/reply-engines', {
      name: 'Bot', mode: 'Webhook', url: 'https://hook.test', timeoutSeconds: 20,
    });
    expect(engine.secret).toBe('whsec_abc');
  });

  it('uses the documented paths and escapes ids', async () => {
    const { http, admin } = make();
    await admin.listNames();
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/reply-engines', { params: { view: 'names' } });
    await admin.listTurns('e1', { cursor: 'c1', limit: 10, includeTests: true });
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/reply-engines/e1/turns', {
      params: { cursor: 'c1', limit: 10, includeTests: 'true' },
    });
    await admin.rotateSecret('e1');
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/reply-engines/e1/rotate-secret');
    await admin.update('e1', { name: 'New' });
    expect(http.patch).toHaveBeenLastCalledWith('/api/v1/reply-engines/e1', { name: 'New' });
    await admin.delete('../admin');
    expect(http.delete).toHaveBeenLastCalledWith('/api/v1/reply-engines/..%2Fadmin');
  });

  it('reads and replaces a widget binding', async () => {
    const { http, admin } = make();
    await admin.getWidgetBinding('w1');
    expect(http.get).toHaveBeenLastCalledWith('/api/v1/widgets/w1/reply-engine');
    await admin.setWidgetBinding('w1', { default: 'e1', channels: { telegram: 'erghi' } });
    expect(http.put).toHaveBeenLastCalledWith('/api/v1/widgets/w1/reply-engine', {
      default: 'e1', channels: { telegram: 'erghi' },
    });
    await admin.setWidgetBinding('w1', {});
    expect(http.put).toHaveBeenLastCalledWith('/api/v1/widgets/w1/reply-engine', { default: null, channels: null });
  });
});

describe('AgentRuntimeResource', () => {
  it('sends snake_case bodies on the agent paths', async () => {
    const { http, runtime } = make();
    await runtime.reply('t1', { idempotency_key: 'k1', messages: [{ content: 'hello' }] });
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/agent/turns/t1/replies', {
      idempotency_key: 'k1', messages: [{ content: 'hello' }],
    });
    await runtime.typing('t1');
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/agent/turns/t1/typing');
    await runtime.handoff('t1', 'billing');
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/agent/turns/t1/handoff', { reason: 'billing' });
    await runtime.decline('t1');
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/agent/turns/t1/decline', {});
    await runtime.takeBack('c1', true);
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/agent/conversations/c1/take-back', { force: true });
    await runtime.postBotMessage('c1', 'k2', 'hi');
    expect(http.post).toHaveBeenLastCalledWith('/api/v1/agent/conversations/c1/bot-messages', {
      idempotency_key: 'k2', content: 'hi',
    });
  });
});

describe('error mapping on the real client', () => {
  async function run(status: number, body: unknown) {
    const client = new ErghiClient({ apiUrl: 'http://x.test', accessToken: 't' });
    client.getHttpClient().defaults.adapter = async (config) => {
      const response = { data: body, status, statusText: '', headers: {}, config };
      if (status >= 400) throw Object.assign(new Error('fail'), { isAxiosError: true, response, config });
      return response;
    };
    return client.agentRuntime.reply('t1', { idempotency_key: 'k' }).catch((e) => e);
  }

  it('turns a 409 into ErghiApiError with errorCode and reason', async () => {
    const err = await run(409, { error: 'Turn closed', code: 'turn_closed', reason: 'deadline' });
    expect(err).toBeInstanceOf(ErghiApiError);
    expect(err.statusCode).toBe(409);
    expect(err.errorCode).toBe('turn_closed');
    expect(err.reason).toBe('deadline');
    expect(err.code).toBe('API_ERROR');
  });

  it('keeps 404 as NotFoundError', async () => {
    expect(await run(404, { error: 'nope', code: 'not_found' })).toBeInstanceOf(NotFoundError);
  });
});
