import type { RequestOptions } from '../http/http-client.js';
import type { Page } from '../http/pagination.js';
import type { PaginationParams, Ulid } from '../types/common.js';
import type { CreateWebhookParams, WebhookSubscription } from '../types/resources.js';
import { Resource } from './resource.js';

/**
 * `/api/v1/webhooks` — outbound webhook subscriptions.
 *
 * Deliveries POST to your URL with `X-Okta-Signature: sha256=<hmac>` (HMAC-SHA256
 * of the raw body, keyed by the subscription secret), plus `X-Okta-Event` and
 * `X-Okta-Delivery`. Verify every delivery before trusting it — see
 * `verifyWebhookSignature` / `parseWebhook` / `WebhookRouter`.
 *
 * Listing needs `webhooks`, `read`, `write` or `admin`; create/delete need
 * `webhooks`, `write` or `admin`. Request just `['read', 'webhooks']` when your
 * app only manages subscriptions.
 */
export class Webhooks extends Resource {
  /**
   * Register a subscription.
   *
   * The response carries `secret` **exactly once** — store it now, because it
   * is encrypted at rest and can never be read back.
   *
   * ```ts
   * const hook = await client.webhooks.create({
   *   name: 'Lifecycle',
   *   url: 'https://example.test/hooks/okta',
   *   events: [WebhookEvents.MessageReceived, WebhookEvents.ChannelDeleted],
   * });
   * await vault.put('okta-webhook-secret', hook.secret!);
   * ```
   */
  create(params: CreateWebhookParams, options?: RequestOptions): Promise<WebhookSubscription> {
    return this.mutate<WebhookSubscription>('post', this.api('/webhooks'), params, options);
  }

  /** List subscriptions. The signing secret is never included here. */
  list(
    params: PaginationParams = {},
    options?: RequestOptions,
  ): Promise<Page<WebhookSubscription>> {
    return this.getPage<WebhookSubscription>(this.api('/webhooks'), { ...params }, options);
  }

  /** Iterate every subscription, transparently walking pages. */
  listAll(
    params: PaginationParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<WebhookSubscription, void, undefined> {
    return this.paginate<WebhookSubscription>(this.api('/webhooks'), { ...params }, options);
  }

  /** Delete a subscription by ULID. Returns `true` once removed. */
  async delete(id: Ulid, options?: RequestOptions): Promise<boolean> {
    const response = await this.http.delete<{ deleted?: boolean }>(
      this.api(`/webhooks/${this.encode(id)}`),
      undefined,
      options,
    );

    return this.confirmedDeleted(response.data);
  }
}
