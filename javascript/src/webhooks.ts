/**
 * Standard Webhooks verification for reply-engine deliveries (server-side only).
 *
 * Erghi signs reply-engine webhooks and workspace webhooks the Standard Webhooks way
 * (https://standardwebhooks.com): headers `webhook-id`, `webhook-timestamp` (Unix seconds) and
 * `webhook-signature` (space-separated `v1,<base64>` entries), the signature being HMAC-SHA256 of
 * `{id}.{timestamp}.{rawBody}` keyed with the base64 bytes after the `whsec_` prefix. During a
 * secret rotation both secrets sign, so any matching entry is enough. Verify the RAW body.
 *
 * Note: the older `verifyWebhookSignature` (X-Erghi-Signature, body-only HMAC) is not this scheme.
 */
import { createHmac, timingSafeEqual } from 'crypto';
import { ErghiError } from './errors';
import type { TurnRequest } from './replyEngineTypes';

export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

export type WebhookFailureReason =
  | 'missing_headers'
  | 'bad_timestamp'
  | 'timestamp_too_old'
  | 'timestamp_in_future'
  | 'no_matching_signature';

export class WebhookVerificationError extends ErghiError {
  constructor(public readonly reason: WebhookFailureReason) {
    super(`Webhook verification failed: ${reason}`, 'WEBHOOK_VERIFICATION_FAILED');
    this.name = 'WebhookVerificationError';
    Object.setPrototypeOf(this, WebhookVerificationError.prototype);
  }
}

export interface VerifyWebhookOptions {
  /** Accepted clock difference in seconds, either way. Default 300 (5 minutes). */
  toleranceSeconds?: number;
  /** Current time in Unix seconds; for tests. */
  now?: number;
}

type HeaderBag = Record<string, string | string[] | undefined> | { get(name: string): string | null };

function key(secret: string): Buffer {
  if (!secret || !secret.trim()) throw new Error('secret is required');
  const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(raw) || raw.length % 4 !== 0) {
    throw new Error('The signing secret is not a valid whsec_ secret');
  }
  return Buffer.from(raw, 'base64');
}

function header(headers: HeaderBag, name: string): string | undefined {
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as { get(n: string): string | null }).get(name) ?? undefined;
  }
  for (const [k, v] of Object.entries(headers as Record<string, string | string[] | undefined>)) {
    if (k.toLowerCase() === name) return Array.isArray(v) ? v[0] : v;
  }
  return undefined;
}

/** The `webhook-signature` value Erghi would send. Useful in your own tests. */
export function signWebhook(secret: string, webhookId: string, timestamp: number, body: string | Buffer): string {
  const digest = createHmac('sha256', key(secret))
    .update(`${webhookId}.${timestamp}.`, 'utf8')
    .update(typeof body === 'string' ? Buffer.from(body, 'utf8') : body)
    .digest('base64');
  return `v1,${digest}`;
}

/**
 * Throws `WebhookVerificationError` unless the delivery is authentic and fresh. `headers` is a
 * plain object (Node `req.headers`) or a `Headers`-like with `get`. `body` is the raw request body.
 * A malformed `secret` throws a plain `Error` (a programming error, not a bad delivery).
 */
export function verifyWebhook(
  secret: string,
  headers: HeaderBag,
  body: string | Buffer,
  options: VerifyWebhookOptions = {}
): void {
  const k = key(secret);
  const id = header(headers, 'webhook-id');
  const timestamp = header(headers, 'webhook-timestamp');
  const signature = header(headers, 'webhook-signature');
  if (!id || !timestamp || !signature) throw new WebhookVerificationError('missing_headers');
  if (!/^[0-9]{1,15}$/.test(timestamp)) throw new WebhookVerificationError('bad_timestamp');

  const tolerance = options.toleranceSeconds ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
  const age = (options.now ?? Date.now() / 1000) - Number(timestamp);
  if (age > tolerance) throw new WebhookVerificationError('timestamp_too_old');
  if (-age > tolerance) throw new WebhookVerificationError('timestamp_in_future');

  const expected = createHmac('sha256', k)
    .update(`${id}.${Number(timestamp)}.`, 'utf8')
    .update(typeof body === 'string' ? Buffer.from(body, 'utf8') : body)
    .digest();

  let matched = false;
  for (const part of signature.split(/\s+/)) {
    const comma = part.indexOf(',');
    if (comma < 0 || part.slice(0, comma) !== 'v1') continue;
    const candidate = Buffer.from(part.slice(comma + 1), 'base64');
    // Check every entry (no early exit) so timing does not reveal which one matched.
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) matched = true;
  }
  if (!matched) throw new WebhookVerificationError('no_matching_signature');
}

/** Like `verifyWebhook` but returns a boolean. */
export function isValidWebhook(
  secret: string,
  headers: HeaderBag,
  body: string | Buffer,
  options: VerifyWebhookOptions = {}
): boolean {
  try {
    verifyWebhook(secret, headers, body, options);
    return true;
  } catch (e) {
    if (e instanceof WebhookVerificationError) return false;
    throw e;
  }
}

/** Verifies the delivery, then parses its body as a `turn.requested` turn. */
export function parseTurnWebhook(
  secret: string,
  headers: HeaderBag,
  body: string | Buffer,
  options: VerifyWebhookOptions = {}
): TurnRequest {
  verifyWebhook(secret, headers, body, options);
  return JSON.parse(typeof body === 'string' ? body : body.toString('utf8')) as TurnRequest;
}
