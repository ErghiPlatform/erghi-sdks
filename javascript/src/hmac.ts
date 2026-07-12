/**
 * HMAC utilities for server-side visitor identity verification and webhook
 * signature validation.
 *
 * These are stateless module-level helpers — they do not require an
 * `ErghiClient` instance. Only call them from your backend; never ship your
 * widget secret key or webhook secret to the browser.
 */
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Generates an HMAC-SHA256 hex digest of the visitorId using the widgetSecretKey.
 *
 * Call this from your backend when a user is logged in and you want to pass
 * their identity to the Erghi widget securely.
 *
 * @param visitorId - Your system's user/visitor identifier (e.g. a UUID or user ID)
 * @param secretKey - The `whsec_...` secret key from the Erghi Admin Portal
 * @returns Lowercase hex-encoded HMAC-SHA256 digest (64 characters)
 *
 * @example
 * ```ts
 * // On your server:
 * const hash = generateIdentityHash(currentUser.id, process.env.ERGHI_WIDGET_SECRET!);
 * // Pass `hash` and `currentUser.id` to your frontend for use with the widget
 * ```
 */
export function generateIdentityHash(visitorId: string, secretKey: string): string {
  if (!visitorId || !secretKey) {
    throw new Error('visitorId and secretKey are required');
  }

  return createHmac('sha256', secretKey).update(visitorId, 'utf8').digest('hex');
}

/**
 * Verifies an incoming Erghi webhook signature.
 *
 * Erghi signs webhook payloads with `HMAC-SHA256(rawBody, webhookSecret)` and
 * sends the result in the `X-Erghi-Signature` header. Always verify this
 * before processing webhook events.
 *
 * @param payload - The raw request body string (do not parse JSON first)
 * @param signature - The value of the `X-Erghi-Signature` header
 * @param secret - Your workspace webhook secret
 * @returns `true` if the signature is valid, `false` otherwise
 */
export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  if (!payload || !signature || !secret) {
    return false;
  }

  try {
    const expected = generateIdentityHash(payload, secret);
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const signatureBuffer = Buffer.from(signature.toLowerCase(), 'utf8');

    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch {
    return false;
  }
}
