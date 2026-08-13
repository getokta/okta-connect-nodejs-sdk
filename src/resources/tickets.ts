import type { RequestOptions } from '../http/http-client.js';
import type { Page } from '../http/pagination.js';
import type { Ulid } from '../types/common.js';
import type {
  OpenTicketParams,
  Ticket,
  TicketListParams,
  TransitionTicketParams,
} from '../types/resources.js';
import { Resource } from './resource.js';

/**
 * `/api/v1/tickets` — support tickets moving across pipeline stages.
 *
 * Reads need `read`; {@link open} and {@link transition} need `write`. A
 * ticket's reported `status` is its current stage's *category*
 * (open / in_progress / on_hold / resolved / closed).
 */
export class Tickets extends Resource {
  list(params: TicketListParams = {}, options?: RequestOptions): Promise<Page<Ticket>> {
    return this.getPage<Ticket>(this.api('/tickets'), { ...params }, options);
  }

  /** Iterate every ticket, transparently walking pages. */
  listAll(
    params: TicketListParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<Ticket, void, undefined> {
    return this.paginate<Ticket>(this.api('/tickets'), { ...params }, options);
  }

  get(id: Ulid, options?: RequestOptions): Promise<Ticket> {
    return this.getOne<Ticket>(this.api(`/tickets/${this.encode(id)}`), undefined, options);
  }

  /**
   * Open a ticket. It lands in the first stage of the given pipeline (or the
   * organization's default), and SLA due dates are computed from that
   * pipeline's policy.
   */
  open(params: OpenTicketParams, options?: RequestOptions): Promise<Ticket> {
    return this.mutate<Ticket>('post', this.api('/tickets'), params, options);
  }

  /**
   * Move a ticket to another stage of its pipeline. Moving into a
   * resolved/closed stage stamps `resolved_at` / `closed_at` automatically.
   */
  transition(
    id: Ulid,
    params: TransitionTicketParams,
    options?: RequestOptions,
  ): Promise<Ticket> {
    return this.mutate<Ticket>(
      'post',
      this.api(`/tickets/${this.encode(id)}/transition`),
      params,
      options,
    );
  }
}
