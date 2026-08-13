import type { RequestOptions } from '../http/http-client.js';
import type {
  Message,
  SendTemplateParams,
  Template,
  TemplateListParams,
} from '../types/resources.js';
import { Resource } from './resource.js';

/**
 * `/api/v1/templates` — the Meta message-template catalogue.
 *
 * Templates are how you open a conversation outside WhatsApp's 24-hour
 * customer-service window. Only `APPROVED` templates can be sent.
 *
 * ```ts
 * const approved = await client.templates.list({ status: 'APPROVED', language: 'ar' });
 * await client.templates.send({
 *   channel_id: channelId,
 *   wa_id: '966500000000',
 *   template_name: 'order_ready',
 *   language: 'ar',
 *   variables: ['12345', '120 SAR'],
 * });
 * ```
 */
export class Templates extends Resource {
  /**
   * List the catalogue. Returns a flat array — the platform does not paginate
   * templates.
   */
  list(params: TemplateListParams = {}, options?: RequestOptions): Promise<Template[]> {
    return this.getList<Template>(this.api('/templates'), { ...params }, options);
  }

  /**
   * Send an approved template to a `wa_id`. Needs the `send` ability; returns
   * the queued message.
   */
  send(params: SendTemplateParams, options?: RequestOptions): Promise<Message> {
    return this.mutate<Message>('post', this.api('/templates/send'), params, options);
  }
}
