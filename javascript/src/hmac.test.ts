import { describe, it, expect } from 'vitest';
import { generateIdentityHash, verifyWebhookSignature } from './hmac';

const SECRET = 'whsec_testSecretKey1234567890abcdef';

describe('generateIdentityHash', () => {
  it('returns a 64-character lowercase hex string', () => {
    const hash = generateIdentityHash('visitor-123', SECRET);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic - same inputs produce same output', () => {
    const a = generateIdentityHash('visitor-abc', SECRET);
    const b = generateIdentityHash('visitor-abc', SECRET);
    expect(a).toBe(b);
  });

  it('differs for different visitor IDs', () => {
    const a = generateIdentityHash('visitor-1', SECRET);
    const b = generateIdentityHash('visitor-2', SECRET);
    expect(a).not.toBe(b);
  });

  it('differs for different secrets', () => {
    const a = generateIdentityHash('visitor-1', 'secret-A');
    const b = generateIdentityHash('visitor-1', 'secret-B');
    expect(a).not.toBe(b);
  });
});

describe('verifyWebhookSignature', () => {
  it('verifies a correct signature', () => {
    const payload = 'test-payload';
    const hash = generateIdentityHash(payload, SECRET);
    expect(verifyWebhookSignature(payload, hash, SECRET)).toBe(true);
  });

  it('rejects a wrong signature', () => {
    expect(verifyWebhookSignature('payload', 'wrongsig', SECRET)).toBe(false);
  });

  it('rejects a tampered payload', () => {
    const hash = generateIdentityHash('original', SECRET);
    expect(verifyWebhookSignature('tampered', hash, SECRET)).toBe(false);
  });
});
