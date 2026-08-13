import type { RequestOptions } from '../http/http-client.js';
import type { Page } from '../http/pagination.js';
import type { Ulid } from '../types/common.js';
import type {
  CreateEmailBroadcastParams,
  EmailBroadcast,
  EmailBroadcastListParams,
} from '../types/resources.js';
import { Resource } from './resource.js';

/**
 * `/api/v1/emails/broadcasts` — bulk email sends to a CRM-tag audience.
 *
 * Same two-step shape as campaigns: {@link create} a draft (needs `write`),
 * then {@link queue} it to fan out one send per recipient (needs `send`).
 */
export class EmailBroadcasts extends Resource {
  list(
    params: EmailBroadcastListParams = {},
    options?: RequestOptions,
  ): Promise<Page<EmailBroadcast>> {
    return this.getPage<EmailBroadcast>(this.api('/emails/broadcasts'), { ...params }, options);
  }

  /** Iterate every broadcast, transparently walking pages. */
  listAll(
    params: EmailBroadcastListParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<EmailBroadcast, void, undefined> {
    return this.paginate<EmailBroadcast>(this.api('/emails/broadcasts'), { ...params }, options);
  }

  get(id: Ulid, options?: RequestOptions): Promise<EmailBroadcast> {
    return this.getOne<EmailBroadcast>(
      this.api(`/emails/broadcasts/${this.encode(id)}`),
      undefined,
      options,
    );
  }

  /**
   * Create a broadcast draft. Omit `audience` to target everyone with an email
   * address on file.
   */
  create(
    params: CreateEmailBroadcastParams,
    options?: RequestOptions,
  ): Promise<EmailBroadcast> {
    return this.mutate<EmailBroadcast>('post', this.api('/emails/broadcasts'), params, options);
  }

  /** Queue a broadcast for immediate or scheduled fan-out. Needs `send`. */
  queue(id: Ulid, options?: RequestOptions): Promise<EmailBroadcast> {
    return this.mutate<EmailBroadcast>(
      'post',
      this.api(`/emails/broadcasts/${this.encode(id)}/queue`),
      {},
      options,
    );
  }
}
