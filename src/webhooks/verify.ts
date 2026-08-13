import { createHmac, timingSafeEqual } from 'node:crypto';
import { WebhookSignatureError } from '../http/errors.js';
import type { WebhookDelivery, WebhookPayload } from './events.js';

/** Header names the platform sets on every delivery. */
export const WEBHOOK_SIGNATURE_HEADER = 'x-okta-signature';
export const WEBHOOK_EVENT_HEADER = 'x-okta-event';
export const WEBHOOK_DELIVERY_HEADER = 'x-okta-delivery';

/**
 * Constant-time check of a delivery's `X-Okta-Signature` against the **raw**
 * request body and your subscription secret.
 *
 * Pass the body exactly as received — a `Buffer` or the untouched string. If
 * your framework parsed it to an object and you re-serialise it, key order and
 * whitespace will drift and the HMAC will not match. In Express, capture it
 * with `express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } })`.
 *
 * ```ts
 * const ok = verifyWebhookSignature(rawBody, req.header('X-Okta-Signature'), secret);
 * if (!ok) return res.sendStatus(400);
 * ```
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined | null,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;

  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const provided = Buffer.from(signatureHeader, 'utf8');
  const computed = Buffer.from(expected, 'utf8');

  // A length mismatch is already a definitive mismatch, and timingSafeEqual
  // throws on unequal buffers — bail before it can.
  if (provided.length !== computed.length) return false;

  return timingSafeEqual(provided, computed);
}

/**
 * Verify **and** decode a delivery in one step.
 *
 * Omit `secret` only when you verify out of band — an unverified delivery is
 * attacker-controlled input, since anyone can POST to your endpoint.
 *
 * ```ts
 * const hook = parseWebhook(rawBody, req.header('X-Okta-Signature'), secret);
 *
 * switch (hook.event) {
 *   case WebhookEvents.MessageReceived:
 *     return reply(hook.payload.conversation?.id);
 *   case WebhookEvents.ChannelDeleted:
 *     return teardown(hook.payload.channel_id);
 * }
 * ```
 *
 * @throws {WebhookSignatureError} on a bad signature or a body that isn't a
 *         JSON object.
 */
export function parseWebhook<P = WebhookPayload>(
  rawBody: string | Buffer,
  signatureHeader?: string | null,
  secret?: string,
): WebhookDelivery<P> {
  if (secret !== undefined) {
    if (!verifyWebhookSignature(rawBody, signatureHeader, secret)) {
      throw new WebhookSignatureError('Webhook signature verification failed.', { status: 400 });
    }
  }

  const text = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

  let decoded: unknown;

  try {
    decoded = JSON.parse(text);
  } catch {
    throw new WebhookSignatureError('Webhook body is not valid JSON.', { status: 400 });
  }

  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
    throw new WebhookSignatureError('Webhook body is not a JSON object.', { status: 400 });
  }

  const envelope = decoded as Record<string, unknown>;

  return {
    event: typeof envelope.event === 'string' ? envelope.event : '',
    organization_id:
      typeof envelope.organization_id === 'number' ? envelope.organization_id : null,
    payload: (envelope.payload ?? {}) as P,
    delivery_id: typeof envelope.delivery_id === 'string' ? envelope.delivery_id : null,
    sent_at: typeof envelope.sent_at === 'string' ? envelope.sent_at : null,
  };
}

/**
 * Read a dotted path out of a webhook payload — `get(hook.payload, 'message.body')`.
 * Returns `fallback` when any segment is missing.
 */
export function get<T = unknown>(payload: unknown, path: string, fallback?: T): T | undefined {
  let value: unknown = payload;

  for (const segment of path.split('.')) {
    if (typeof value !== 'object' || value === null || !(segment in value)) return fallback;

    value = (value as Record<string, unknown>)[segment];
  }

  return (value as T) ?? fallback;
}
