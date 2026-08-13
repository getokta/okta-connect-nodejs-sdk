import type { RequestOptions } from '../http/http-client.js';
import type { Page } from '../http/pagination.js';
import type { Ulid } from '../types/common.js';
import type {
  Campaign,
  CampaignListParams,
  CreateCampaignParams,
} from '../types/resources.js';
import { Resource } from './resource.js';

/**
 * `/api/v1/campaigns` — broadcast (bulk / drip) messaging campaigns.
 *
 * Two steps: {@link create} a draft against a channel, then {@link queue} it to
 * materialise the audience and start sending. Creating needs `write`; queueing
 * dispatches outbound traffic and needs `send`.
 */
export class Campaigns extends Resource {
  list(params: CampaignListParams = {}, options?: RequestOptions): Promise<Page<Campaign>> {
    return this.getPage<Campaign>(this.api('/campaigns'), { ...params }, options);
  }

  /** Iterate every campaign, transparently walking pages. */
  listAll(
    params: CampaignListParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<Campaign, void, undefined> {
    return this.paginate<Campaign>(this.api('/campaigns'), { ...params }, options);
  }

  get(id: Ulid, options?: RequestOptions): Promise<Campaign> {
    return this.getOne<Campaign>(this.api(`/campaigns/${this.encode(id)}`), undefined, options);
  }

  /**
   * Create a draft campaign. Omit `audience_filter` to target every opted-in
   * contact; otherwise select by `contact_ids` and/or `tag_slugs`.
   */
  create(params: CreateCampaignParams, options?: RequestOptions): Promise<Campaign> {
    return this.mutate<Campaign>('post', this.api('/campaigns'), params, options);
  }

  /** Queue a draft: materialises its audience and starts sending. Needs `send`. */
  queue(id: Ulid, options?: RequestOptions): Promise<Campaign> {
    return this.mutate<Campaign>(
      'post',
      this.api(`/campaigns/${this.encode(id)}/queue`),
      {},
      options,
    );
  }
}
