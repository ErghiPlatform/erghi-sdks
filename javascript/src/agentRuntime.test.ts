import { describe, it, expect, vi } from 'vitest';
import { AgentRuntimeClient, AgentRuntimeConnection } from './agentRuntime';
import type { TurnRequest } from './replyEngineTypes';

class FakeConnection implements AgentRuntimeConnection {
  handlers = new Map<string, (...a: any[]) => void>();
  reconnecting: Array<(e?: Error) => void> = [];
  reconnected: Array<() => void> = [];
  closed: Array<(e?: Error) => void> = [];
  calls: Array<{ method: string; args: unknown[] }> = [];
  starts = 0;
  stops = 0;
  start = async () => { this.starts++; };
  stop = async () => { this.stops++; };
  invoke = async <T>(method: string, ...args: unknown[]) => {
    this.calls.push({ method, args });
    return { ok: true } as T;
  };
  on(name: string, h: (...a: any[]) => void) { this.handlers.set(name, h); }
  onreconnecting(h: (e?: Error) => void) { this.reconnecting.push(h); }
  onreconnected(h: () => void) { this.reconnected.push(h); }
  onclose(h: (e?: Error) => void) { this.closed.push(h); }
  push(name: string, ...args: unknown[]) { this.handlers.get(name)!(...args); }
}

const turn = (id: string, sequence: number): TurnRequest =>
  ({ type: 'turn.requested', turn_id: id, sequence, engine_id: 'e1', workspace_id: 'w1', is_test: false,
     conversation: { id: 'c1' }, messages: [], history: [] }) as TurnRequest;

function make(extra: Partial<ConstructorParameters<typeof AgentRuntimeClient>[0]> = {}) {
  const conn = new FakeConnection();
  let url = '';
  const client = new AgentRuntimeClient({
    apiUrl: 'https://api.test/',
    engineId: 'e 1',
    accessTokenFactory: () => 'tok',
    connectionFactory: (u) => { url = u; return conn; },
    ...extra,
  });
  return { conn, client, url: () => url };
}

describe('AgentRuntimeClient', () => {
  it('connects to the hub with the engine id escaped', () => {
    expect(make().url()).toBe('https://api.test/hubs/agent-runtime?engineId=e%201');
  });

  it('emits each turn once and tracks the highest sequence', () => {
    const { conn, client } = make();
    const seen: string[] = [];
    client.on('turnRequested', (t) => seen.push(t.turn_id));
    conn.push('TurnRequested', turn('a', 3));
    conn.push('TurnRequested', turn('a', 3));
    conn.push('TurnRequested', turn('b', 2));
    expect(seen).toEqual(['a', 'b']);
    expect(client.lastSequence).toBe(3);
  });

  it('calls Resume(lastSequence) after a reconnect', async () => {
    const { conn, client } = make();
    const resumed = vi.fn();
    client.on('resumed', resumed);
    await client.start();
    expect(conn.calls).toEqual([]); // nothing to resume on a fresh start
    conn.push('TurnRequested', turn('a', 7));
    conn.reconnecting[0]();
    conn.reconnected[0]();
    await vi.waitFor(() => expect(resumed).toHaveBeenCalled());
    expect(conn.calls).toEqual([{ method: 'Resume', args: [7] }]);
  });

  it('resumes at start when given a lastSequence', async () => {
    const { conn, client } = make({ lastSequence: 41 });
    await client.start();
    expect(conn.calls).toEqual([{ method: 'Resume', args: [41] }]);
  });

  it('maps the answer methods to hub calls', async () => {
    const { conn, client } = make();
    await client.ack('t');
    await client.typing('t');
    await client.replyDelta('t', 's', 'he');
    await client.replyComplete('t', { idempotency_key: 'k', messages: [{ content: 'hi' }] }, 's');
    await client.replyComplete('t', { idempotency_key: 'k2' });
    await client.handoff('t', 'why');
    await client.decline('t');
    await client.takeBack('c', true);
    expect(conn.calls.map((c) => [c.method, ...c.args])).toEqual([
      ['Ack', 't'], ['Typing', 't'], ['ReplyDelta', 't', 's', 'he'],
      ['ReplyComplete', 't', { idempotency_key: 'k', messages: [{ content: 'hi' }] }, 's'],
      ['ReplyComplete', 't', { idempotency_key: 'k2' }],
      ['Handoff', 't', 'why'], ['Decline', 't', null], ['TakeBack', 'c', true],
    ]);
  });

  it('surfaces a failed Resume as an error event, not a throw', async () => {
    const { conn, client } = make();
    conn.invoke = async () => { throw new Error('boom'); };
    const errors: unknown[] = [];
    client.on('error', (e) => errors.push(e));
    conn.reconnected[0]();
    await vi.waitFor(() => expect(errors).toHaveLength(1));
  });

  it('forwards claimed, closed and stop', async () => {
    const { conn, client } = make();
    const claimed = vi.fn();
    const closed = vi.fn();
    client.on('turnClaimed', claimed);
    client.on('closed', closed);
    conn.push('TurnClaimed', 't1');
    conn.closed[0]();
    await client.stop();
    expect(claimed).toHaveBeenCalledWith('t1');
    expect(closed).toHaveBeenCalled();
    expect(conn.stops).toBe(1);
  });
});
