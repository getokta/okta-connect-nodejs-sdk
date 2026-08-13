import type { HttpClient, RequestOptions } from '../http/http-client.js';
import type { Page } from '../http/pagination.js';
import type { Ulid } from '../types/common.js';
import type {
  EmailAnalytics,
  EmailAnalyticsParams,
  EmailListParams,
  EmailMessage,
  SendEmailParams,
} from '../types/resources.js';
import { EmailBroadcasts } from './email-broadcasts.js';
import { EmailSuppressions } from './email-suppressions.js';
import { EmailTemplates } from './email-templates.js';
import { Resource } from './resource.js';

/** Anything that renders to an HTML string — notably `HtmlMessageBuilder`. */
export interface HtmlSource {
  toHtml(): string;
}

function toHtmlString(html: string | HtmlSource): string {
  return typeof html === 'string' ? html : html.toHtml();
}

/**
 * `/api/v1/emails` — transactional email, the send log, and deliverability
 * analytics, with nested accessors for templates, broadcasts and suppressions.
 *
 * Sending requires a verified sending domain (or your own SMTP credentials)
 * plus the `send` ability; the platform DKIM-signs the message server-side.
 *
 * ```ts
 * await client.emails.send({
 *   from: 'Acme <hello@mail.acme.com>',
 *   to: ['ali@example.com'],
 *   subject: 'Your receipt',
 *   html: '<h1>Thanks!</h1>',
 * }, { idempotencyKey: 'order-1042-receipt' });
 * ```
 */
export class Emails extends Resource {
  /** Reusable email templates. */
  readonly templates: EmailTemplates;

  /** Bulk sends to a CRM-tag audience. */
  readonly broadcasts: EmailBroadcasts;

  /** The do-not-send list. */
  readonly suppressions: EmailSuppressions;

  constructor(http: HttpClient) {
    super(http);
    this.templates = new EmailTemplates(http);
    this.broadcasts = new EmailBroadcasts(http);
    this.suppressions = new EmailSuppressions(http);
  }

  /**
   * Send an email. `from` accepts `Name <addr@domain>` or a bare address on a
   * verified domain; at least one of `html`, `text` or `template` is required.
   */
  send(params: SendEmailParams, options?: RequestOptions): Promise<EmailMessage> {
    return this.mutate<EmailMessage>('post', this.api('/emails'), params, options);
  }

  /**
   * Send a pre-rendered HTML body. A single string recipient is normalised to
   * a list, and an `HtmlMessageBuilder` is accepted directly:
   *
   * ```ts
   * await client.emails.sendHtml(
   *   'Acme <hello@mail.acme.com>',
   *   'ali@example.com',
   *   'Your receipt',
   *   HtmlMessageBuilder.make().heading('Thanks!').button('View order', url),
   * );
   * ```
   */
  sendHtml(
    from: string,
    to: string | string[],
    subject: string,
    html: string | HtmlSource,
    overrides: Partial<SendEmailParams> = {},
    options?: RequestOptions,
  ): Promise<EmailMessage> {
    return this.send(
      {
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html: toHtmlString(html),
        ...overrides,
      },
      options,
    );
  }

  /**
   * Render a stored template (by slug or ULID) with `variables` and send it.
   * The template's own subject wins over any `subject` in `overrides`.
   */
  sendTemplate(
    from: string,
    to: string | string[],
    template: string,
    variables: Record<string, unknown> = {},
    overrides: Partial<SendEmailParams> = {},
    options?: RequestOptions,
  ): Promise<EmailMessage> {
    return this.send(
      {
        from,
        to: Array.isArray(to) ? to : [to],
        template,
        variables,
        ...overrides,
      },
      options,
    );
  }

  /** The send log. */
  list(params: EmailListParams = {}, options?: RequestOptions): Promise<Page<EmailMessage>> {
    return this.getPage<EmailMessage>(this.api('/emails'), { ...params }, options);
  }

  /** Iterate the whole send log, transparently walking pages. */
  listAll(
    params: EmailListParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<EmailMessage, void, undefined> {
    return this.paginate<EmailMessage>(this.api('/emails'), { ...params }, options);
  }

  /** One sent message by ULID. */
  get(id: Ulid, options?: RequestOptions): Promise<EmailMessage> {
    return this.getOne<EmailMessage>(this.api(`/emails/${this.encode(id)}`), undefined, options);
  }

  /**
   * Deliverability analytics for a date window (`YYYY-MM-DD`, defaulting to
   * the last 30 days): totals, delivery/bounce rates, and a per-day series.
   */
  async analytics(
    params: EmailAnalyticsParams = {},
    options?: RequestOptions,
  ): Promise<EmailAnalytics> {
    const result = await this.getOne<EmailAnalytics>(
      this.api('/emails/analytics'),
      { ...params },
      options,
    );

    return { ...result, summary: result?.summary ?? {}, series: result?.series ?? [] };
  }
}
