import type {
  ChannelEventPayload,
  MessageEventPayload,
  PayloadFor,
  SubscriptionEventPayload,
  WebhookDelivery,
  WebhookEventPattern,
  WebhookPayload,
} from './events.js';
import { parseWebhook } from './verify.js';

export type WebhookHandler<P = WebhookPayload> = (
  delivery: WebhookDelivery<P>,
) => void | Promise<void>;

/**
 * Register one handler per event (or per family) and dispatch inbound
 * deliveries to the right ones — cleaner than a growing `switch`.
 *
 * ```ts
 * const router = new WebhookRouter(secret)
 *   .on(WebhookEvents.MessageReceived, (hook) => reply(hook.payload.conversation?.id))
 *   .onMessage((hook) => log(hook.payload.message?.status))   // any message.*
 *   .onChannel((hook) => sync(hook.payload.channel_id))
 *   .onAny((hook) => audit(hook));                            // fallback
 *
 * app.post('/hooks/okta', async (req, res) => {
 *   await router.dispatch(req.rawBody, req.header('X-Okta-Signature'));
 *   res.sendStatus(200);
 * });
 * ```
 *
 * Every matching handler runs, in this order: the exact event, then its
 * `family.*` wildcard, then `*`. Handlers run sequentially, and `dispatch`
 * awaits each one, so a rejected handler surfaces to your route — which is
 * what you want: returning non-2xx makes the platform retry the delivery.
 */
export class WebhookRouter {
  private readonly handlers = new Map<string, WebhookHandler<never>[]>();

  /**
   * @param secret When set, {@link dispatch} verifies the HMAC and throws on a
   *        mismatch. Omit only when you verify out of band.
   */
  constructor(private readonly secret?: string) {}

  /**
   * Register a handler for an exact event, or a `family.*` wildcard. The
   * handler's payload is typed from the event name, so
   * `on('message.received', h => h.payload.message?.body)` needs no cast.
   */
  on<E extends WebhookEventPattern>(event: E, handler: WebhookHandler<PayloadFor<E>>): this {
    const existing = this.handlers.get(event) ?? [];
    existing.push(handler as WebhookHandler<never>);
    this.handlers.set(event, existing);

    return this;
  }

  /** Any `message.*` event. */
  onMessage(handler: WebhookHandler<MessageEventPayload>): this {
    return this.on('message.*', handler);
  }

  /** Any `channel.*` event. */
  onChannel(handler: WebhookHandler<ChannelEventPayload>): this {
    return this.on('channel.*', handler);
  }

  /** Any `subscription.*` billing event. */
  onSubscription(handler: WebhookHandler<SubscriptionEventPayload>): this {
    return this.on('subscription.*', handler);
  }

  /** Any `conversation.*` event. */
  onConversation(handler: WebhookHandler): this {
    return this.on('conversation.*', handler);
  }

  /** Any `email.*` delivery event. */
  onEmail(handler: WebhookHandler): this {
    return this.on('email.*', handler);
  }

  /** Fallback, run after any more specific handler. */
  onAny(handler: WebhookHandler): this {
    return this.on('*', handler);
  }

  /**
   * Verify, parse, and run every matching handler. Returns the parsed delivery
   * so the caller can log it before responding 200.
   *
   * @throws {import('../http/errors.js').WebhookSignatureError} on a bad
   *         signature or non-JSON body.
   */
  async dispatch(
    rawBody: string | Buffer,
    signatureHeader?: string | null,
  ): Promise<WebhookDelivery> {
    const delivery = parseWebhook(rawBody, signatureHeader, this.secret);

    for (const handler of this.matching(delivery.event)) {
      await (handler as WebhookHandler)(delivery);
    }

    return delivery;
  }

  /** Handlers for `event`, most specific first. */
  private matching(event: string): WebhookHandler<never>[] {
    const family = event.includes('.') ? `${event.split('.')[0]}.*` : '';

    return [
      ...(this.handlers.get(event) ?? []),
      ...(family ? (this.handlers.get(family) ?? []) : []),
      ...(this.handlers.get('*') ?? []),
    ];
  }
}
