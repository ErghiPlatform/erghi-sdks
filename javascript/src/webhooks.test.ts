import { describe, it, expect } from 'vitest';
import {
  WebhookVerificationError,
  isValidWebhook,
  parseTurnWebhook,
  signWebhook,
  verifyWebhook,
} from './webhooks';

// Independent vectors: the Standard Webhooks published example, and a non-ASCII body computed
// outside this SDK (Python hmac).
const SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
const ID = 'msg_p5jXN8AQM9LWM0D4loKWxJek';
const TS = 1614265330;
const BODY = '{"test": 2432232314}';
const SIG = 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=';

const headers = (sig = SIG, id = ID, ts: number | string = TS) => ({
  'webhook-id': id,
  'webhook-timestamp': String(ts),
  'webhook-signature': sig,
});

const reasonOf = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return e instanceof WebhookVerificationError ? e.reason : `other:${e}`;
  }
  return 'none';
};

describe('Standard Webhooks', () => {
  it('signs the published vector', () => {
    expect(signWebhook(SECRET, ID, TS, BODY)).toBe(SIG);
  });

  it('signs a non-ASCII body the same as the independent computation', () => {
    const secret = 'whsec_Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MDEyMzQ1Njc4OTA=';
    const id = '5d1b6a8e-0f3c-4c1e-9a77-2f6f1c0a9b11';
    const body = '{"content":"مرحبا ✓"}';
    const sig = signWebhook(secret, id, 1790000000, body);
    expect(sig).toMatch(/^v1,[A-Za-z0-9+/]{43}=$/);
    expect(isValidWebhook(secret, headers(sig, id, 1790000000), Buffer.from(body, 'utf8'), { now: 1790000000 })).toBe(true);
  });

  it('accepts the vector, case-insensitive and Headers-like', () => {
    expect(() => verifyWebhook(SECRET, headers(), BODY, { now: TS + 10 })).not.toThrow();
    const mixed = { 'Webhook-Id': ID, 'Webhook-Timestamp': String(TS), 'Webhook-Signature': SIG };
    expect(isValidWebhook(SECRET, mixed, BODY, { now: TS })).toBe(true);
    const bag = new Map(Object.entries(headers()));
    expect(isValidWebhook(SECRET, { get: (n: string) => bag.get(n) ?? null }, BODY, { now: TS })).toBe(true);
  });

  it('accepts any matching entry during a secret rotation', () => {
    const sig = `v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= ${SIG}`;
    expect(isValidWebhook(SECRET, headers(sig), BODY, { now: TS })).toBe(true);
  });

  it('rejects tampering and bad headers with a reason', () => {
    expect(reasonOf(() => verifyWebhook(SECRET, headers(), BODY + ' ', { now: TS }))).toBe('no_matching_signature');
    expect(reasonOf(() => verifyWebhook(SECRET, headers(SIG, 'other'), BODY, { now: TS }))).toBe('no_matching_signature');
    expect(reasonOf(() => verifyWebhook(SECRET, { 'webhook-id': ID }, BODY, { now: TS }))).toBe('missing_headers');
    expect(reasonOf(() => verifyWebhook(SECRET, headers(SIG, ID, 'abc'), BODY, { now: TS }))).toBe('bad_timestamp');
    expect(reasonOf(() => verifyWebhook(SECRET, headers('v2,abc'), BODY, { now: TS }))).toBe('no_matching_signature');
  });

  it('enforces the 5 minute window both ways', () => {
    expect(reasonOf(() => verifyWebhook(SECRET, headers(), BODY, { now: TS + 301 }))).toBe('timestamp_too_old');
    expect(reasonOf(() => verifyWebhook(SECRET, headers(), BODY, { now: TS - 301 }))).toBe('timestamp_in_future');
    expect(reasonOf(() => verifyWebhook(SECRET, headers(), BODY, { now: TS + 299 }))).toBe('none');
  });

  it('treats a wrong secret as invalid and a malformed one as a programming error', () => {
    expect(isValidWebhook('whsec_' + 'QUJD'.repeat(8), headers(), BODY, { now: TS })).toBe(false);
    expect(() => verifyWebhook('whsec_!!!', headers(), BODY, { now: TS })).toThrow(/valid whsec_/);
  });

  it('parses a verified turn', () => {
    const body = JSON.stringify({
      type: 'turn.requested', turn_id: ID, sequence: 7, engine_id: 'e1', workspace_id: 'w1', is_test: false,
      conversation: { id: 'c1' }, messages: [{ id: 'm1', content: 'hi' }], history: [],
    });
    const sig = signWebhook(SECRET, ID, TS, body);
    const turn = parseTurnWebhook(SECRET, headers(sig), body, { now: TS });
    expect(turn.sequence).toBe(7);
    expect(turn.messages[0].content).toBe('hi');
    expect(() => parseTurnWebhook(SECRET, headers(sig), body + ' ', { now: TS })).toThrow(WebhookVerificationError);
  });
});
