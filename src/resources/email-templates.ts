import type { RequestOptions } from '../http/http-client.js';
import type { Page } from '../http/pagination.js';
import type { PaginationParams, Ulid } from '../types/common.js';
import type {
  CreateEmailTemplateParams,
  EmailTemplate,
  UpdateEmailTemplateParams,
} from '../types/resources.js';
import { Resource } from './resource.js';

/**
 * `/api/v1/email-templates` — reusable email templates with `{{ variable }}`
 * placeholders. Reached via `client.emails.templates`.
 */
export class EmailTemplates extends Resource {
  list(params: PaginationParams = {}, options?: RequestOptions): Promise<Page<EmailTemplate>> {
    return this.getPage<EmailTemplate>(this.api('/email-templates'), { ...params }, options);
  }

  /** Iterate every template, transparently walking pages. */
  listAll(
    params: PaginationParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<EmailTemplate, void, undefined> {
    return this.paginate<EmailTemplate>(this.api('/email-templates'), { ...params }, options);
  }

  get(id: Ulid, options?: RequestOptions): Promise<EmailTemplate> {
    return this.getOne<EmailTemplate>(
      this.api(`/email-templates/${this.encode(id)}`),
      undefined,
      options,
    );
  }

  /** Create a template. `slug` is derived from `name` when omitted. */
  create(params: CreateEmailTemplateParams, options?: RequestOptions): Promise<EmailTemplate> {
    return this.mutate<EmailTemplate>('post', this.api('/email-templates'), params, options);
  }

  /** Patch a template — only the fields you send are changed. */
  update(
    id: Ulid,
    params: UpdateEmailTemplateParams,
    options?: RequestOptions,
  ): Promise<EmailTemplate> {
    return this.mutate<EmailTemplate>(
      'patch',
      this.api(`/email-templates/${this.encode(id)}`),
      params,
      options,
    );
  }

  /** Delete a template. Returns `true` once removed. */
  async delete(id: Ulid, options?: RequestOptions): Promise<boolean> {
    const response = await this.http.delete<{ deleted?: boolean }>(
      this.api(`/email-templates/${this.encode(id)}`),
      undefined,
      options,
    );

    return this.confirmedDeleted(response.data);
  }
}
