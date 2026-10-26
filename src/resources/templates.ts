import type { RequestOptions } from '../http/http-client.js';
import type { DataEnvelope, Ulid } from '../types/common.js';
import type {
  CreateTemplateFromPresetParams,
  Message,
  SaveTemplateParams,
  SendTemplateParams,
  Template,
  TemplateFromPreset,
  TemplateListParams,
  TemplatePreset,
  TemplatePresetListParams,
  TemplateSubmission,
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
 *
 * Authoring — `save`, `submit`, `delete`, `createFromPreset` — needs a
 * `write` token, never `send`: a client can own the whole template cycle
 * without being allowed to message anyone.
 *
 * ```ts
 * // Start from the library instead of a blank page:
 * const presets = await client.templates.presets({ category: 'utility', language: 'ar' });
 * const { template, submission } = await client.templates.createFromPreset('order_shipped', {
 *   group: 'Orders',
 *   submit: true,
 * });
 * if (submission && !submission.submitted) console.warn(submission.error);
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

  /**
   * Create or update a template, stored as a DRAFT — this does not submit
   * it. Re-posting an existing (`name`, `language`) pair updates it.
   * Omit `group` to keep the folder; `null` or `''` clears it. `buttons`
   * follows the same rule: omit it to keep the stored buttons, pass `[]` or
   * `null` to remove them.
   */
  save(params: SaveTemplateParams, options?: RequestOptions): Promise<Template> {
    return this.mutate<Template>('post', this.api('/templates'), params, options);
  }

  /**
   * Submit a template to Meta for review. `channelId` is only needed when
   * the template has no channel of its own; otherwise the platform uses the
   * template's channel, or the workspace's only template-capable one. A
   * `ValidationError` with `no_template_capable_channel` means nothing in the
   * workspace has a WABA (see `Channel.supports_templates`).
   */
  submit(id: Ulid, channelId?: Ulid, options?: RequestOptions): Promise<Template> {
    return this.mutate<Template>(
      'post',
      this.api(`/templates/${this.encode(id)}/submit`),
      channelId === undefined ? {} : { channel_id: channelId },
      options,
    );
  }

  /** Delete a template — from Meta too when it was submitted. Returns `true` once removed. */
  async delete(id: Ulid, options?: RequestOptions): Promise<boolean> {
    const response = await this.http.delete<{ deleted?: boolean }>(
      this.api(`/templates/${this.encode(id)}`),
      undefined,
      options,
    );

    return this.confirmedDeleted(response.data);
  }

  /**
   * The library of ready-made templates, written to pass Meta's review. A
   * `language` filter also narrows each preset's `variants` to that language.
   */
  presets(
    params: TemplatePresetListParams = {},
    options?: RequestOptions,
  ): Promise<TemplatePreset[]> {
    return this.getList<TemplatePreset>(this.api('/templates/presets'), { ...params }, options);
  }

  /**
   * Add a library preset to the workspace as a DRAFT template, optionally
   * submitting it to Meta at once (`submit: true`).
   *
   * The template is created even when submission fails, so a failed
   * submission is not a rejected promise: check `submission.submitted` and
   * retry with `submit()` once the cause is fixed. Unknown preset or channel
   * → `NotFoundError`; an explicit `name` already taken → `ValidationError`.
   */
  async createFromPreset(
    key: string,
    params: CreateTemplateFromPresetParams = {},
    options?: RequestOptions,
  ): Promise<TemplateFromPreset> {
    const response = await this.http.post<
      DataEnvelope<Template> & { meta?: { submission?: TemplateSubmission | null } }
    >(this.api(`/templates/presets/${this.encode(key)}`), params, options);

    const body = response.data;
    const submission = body?.meta?.submission;

    return {
      template: body?.data ?? (body as unknown as Template),
      submission: submission && typeof submission === 'object' ? submission : null,
    };
  }
}
