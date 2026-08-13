import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  parseWebhook,
  verifyWebhookSignature,
  WebhookEvents,
  WebhookRouter,
  WebhookSignatureError,
  getWebhookValue,
} from '../src/index.js';

const SECRET = 'whsec_test';

function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function delivery(event: string, payload: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event,
    organization_id: 42,
    payload,
    delivery_id: '01HDEL',
    sent_at: '2026-07-14T09:30:00+00:00',
  });
}

describe('verifyWebhookSignature', () => {
  it('accepts a correctly signed body', () => {
    const body = delivery(WebhookEvents.MessageReceived);

    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('accepts a Buffer body', () => {
    const body = delivery(WebhookEvents.MessageReceived);

    expect(verifyWebhookSignature(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const body = delivery(WebhookEvents.MessageReceived);
    const signature = sign(body);

    expect(verifyWebhookSignature(`${body} `, signature, SECRET)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    const body = delivery(WebhookEvents.MessageReceived);

    expect(verifyWebhookSignature(body, sign(body, 'other-secret'), SECRET)).toBe(false);
  });

  it('rejects a missing or malformed header without throwing', () => {
    const body = delivery(WebhookEvents.MessageReceived);

    expect(verifyWebhookSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, '', SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, 'sha256=short', SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, sign(body), '')).toBe(false);
  });
});

describe('parseWebhook', () => {
  it('verifies then decodes the envelope', () => {
    const body = delivery(WebhookEvents.MessageSent, {
      message: { id: '01HMSG', body: 'Hi', is_reply: true, status: 'sent' },
      conversation: { id: '01HCONV', kind: 'dm' },
      channel: { id: '01HCH', type: 'cloud_api' },
    });

    const hook = parseWebhook(body, sign(body), SECRET);

    expect(hook.event).toBe('message.sent');
    expect(hook.organization_id).toBe(42);
    expect(hook.delivery_id).toBe('01HDEL');
    expect(getWebhookValue(hook.payload, 'message.body')).toBe('Hi');
    expect(getWebhookValue(hook.payload, 'conversation.id')).toBe('01HCONV');
    expect(getWebhookValue(hook.payload, 'channel.type')).toBe('cloud_api');
  });

  it('throws on a bad signature', () => {
    const body = delivery(WebhookEvents.MessageSent);

    expect(() => parseWebhook(body, sign(body, 'wrong'), SECRET)).toThrow(WebhookSignatureError);
  });

  it('throws when the secret is given but the header is missing', () => {
    const body = delivery(WebhookEvents.MessageSent);

    expect(() => parseWebhook(body, undefined, SECRET)).toThrow(WebhookSignatureError);
  });

  it('skips verification when no secret is supplied', () => {
    const body = delivery(WebhookEvents.MessageSent);

    expect(parseWebhook(body).event).toBe('message.sent');
  });

  it('rejects a non-JSON or non-object body', () => {
    expect(() => parseWebhook('not json')).toThrow(WebhookSignatureError);
    expect(() => parseWebhook('[1,2,3]')).toThrow(WebhookSignatureError);
  });

  it('defaults the optional envelope fields', () => {
    const hook = parseWebhook(JSON.stringify({ event: 'channel.deleted' }));

    expect(hook.payload).toEqual({});
    expect(hook.organization_id).toBeNull();
    expect(hook.delivery_id).toBeNull();
  });
});

describe('getWebhookValue', () => {
  it('returns the fallback for a missing path', () => {
    expect(getWebhookValue({ a: { b: 1 } }, 'a.b')).toBe(1);
    expect(getWebhookValue({ a: { b: 1 } }, 'a.c', 'none')).toBe('none');
    expect(getWebhookValue({ a: 1 }, 'a.b.c', 'none')).toBe('none');
    expect(getWebhookValue(null, 'a', 'none')).toBe('none');
  });
});

describe('WebhookRouter', () => {
  it('runs the exact handler, then the family, then the catch-all', async () => {
    const order: string[] = [];
    const router = new WebhookRouter(SECRET)
      .onAny(() => void order.push('any'))
      .onMessage(() => void order.push('family'))
      .on(WebhookEvents.MessageReceived, () => void order.push('exact'));

    const body = delivery(WebhookEvents.MessageReceived);
    await router.dispatch(body, sign(body));

    expect(order).toEqual(['exact', 'family', 'any']);
  });

  it('does not run handlers from another family', async () => {
    const message = vi.fn();
    const channel = vi.fn();
    const router = new WebhookRouter(SECRET).onMessage(message).onChannel(channel);

    const body = delivery(WebhookEvents.ChannelDeleted, { channel_id: '01HCH' });
    await router.dispatch(body, sign(body));

    expect(message).not.toHaveBeenCalled();
    expect(channel).toHaveBeenCalledTimes(1);
  });

  it('awaits async handlers before resolving', async () => {
    let finished = false;
    const router = new WebhookRouter(SECRET).onMessage(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      finished = true;
    });

    const body = delivery(WebhookEvents.MessageSent);
    await router.dispatch(body, sign(body));

    expect(finished).toBe(true);
  });

  it('propagates a handler rejection so the route can answer non-2xx', async () => {
    const router = new WebhookRouter(SECRET).onMessage(() => {
      throw new Error('handler exploded');
    });

    const body = delivery(WebhookEvents.MessageSent);

    await expect(router.dispatch(body, sign(body))).rejects.toThrow('handler exploded');
  });

  it('refuses a delivery with a bad signature', async () => {
    const handler = vi.fn();
    const router = new WebhookRouter(SECRET).onAny(handler);

    const body = delivery(WebhookEvents.MessageSent);

    await expect(router.dispatch(body, sign(body, 'wrong'))).rejects.toBeInstanceOf(
      WebhookSignatureError,
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it('registers multiple handlers for the same event', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const router = new WebhookRouter()
      .on(WebhookEvents.EmailBounced, first)
      .on(WebhookEvents.EmailBounced, second);

    await router.dispatch(delivery(WebhookEvents.EmailBounced));

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('returns the parsed delivery from dispatch', async () => {
    const router = new WebhookRouter();

    const hook = await router.dispatch(delivery(WebhookEvents.ConnectionRevoked, { source: 'app' }));

    expect(hook.event).toBe('connection.revoked');
    expect(hook.payload).toEqual({ source: 'app' });
  });
});
