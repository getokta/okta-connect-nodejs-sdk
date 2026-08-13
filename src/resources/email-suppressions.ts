import type { RequestOptions } from '../http/http-client.js';
import type { Page } from '../http/pagination.js';
import type {
  EmailSuppression,
  EmailSuppressionListParams,
} from '../types/resources.js';
import { Resource } from './resource.js';

/**
 * `/api/v1/emails/suppressions` — the do-not-send list.
 *
 * Hard bounces and spam complaints land here automatically; you can also add
 * and remove addresses by hand. Suppressed addresses are skipped by both
 * transactional sends and broadcasts.
 */
export class EmailSuppressions extends Resource {
  list(
    params: EmailSuppressionListParams = {},
    options?: RequestOptions,
  ): Promise<Page<EmailSuppression>> {
    return this.getPage<EmailSuppression>(
      this.api('/emails/suppressions'),
      { ...params },
      options,
    );
  }

  /** Iterate every suppression, transparently walking pages. */
  listAll(
    params: EmailSuppressionListParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<EmailSuppression, void, undefined> {
    return this.paginate<EmailSuppression>(
      this.api('/emails/suppressions'),
      { ...params },
      options,
    );
  }

  /** Suppress an address manually. */
  add(address: string, options?: RequestOptions): Promise<EmailSuppression> {
    return this.mutate<EmailSuppression>(
      'post',
      this.api('/emails/suppressions'),
      { address },
      options,
    );
  }

  /**
   * Lift a suppression, by ULID or by the raw address. Returns `true` once
   * removed.
   */
  async remove(idOrAddress: string, options?: RequestOptions): Promise<boolean> {
    const response = await this.http.delete<{ deleted?: boolean }>(
      this.api(`/emails/suppressions/${this.encode(idOrAddress)}`),
      undefined,
      options,
    );

    return this.confirmedDeleted(response.data);
  }
}
