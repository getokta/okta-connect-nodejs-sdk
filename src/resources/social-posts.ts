import type { RequestOptions } from '../http/http-client.js';
import type { Page } from '../http/pagination.js';
import type { IsoDateTime, Ulid } from '../types/common.js';
import type {
  CreateSocialPostParams,
  SocialPost,
  SocialPostListParams,
  SocialPostMedia,
} from '../types/resources.js';
import { Resource } from './resource.js';

/**
 * `/api/v1/social-posts` — compose once, publish to many.
 *
 * A post fans out to one target per channel (Telegram, X, Instagram, TikTok,
 * Snapchat …); each target reports its own status, permalink and failure
 * reason. With a future `scheduled_at` the post is scheduled; without one it
 * stays a draft.
 */
export class SocialPosts extends Resource {
  list(params: SocialPostListParams = {}, options?: RequestOptions): Promise<Page<SocialPost>> {
    return this.getPage<SocialPost>(this.api('/social-posts'), { ...params }, options);
  }

  /** Iterate every post, transparently walking pages. */
  listAll(
    params: SocialPostListParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<SocialPost, void, undefined> {
    return this.paginate<SocialPost>(this.api('/social-posts'), { ...params }, options);
  }

  /** Fetch one post, including each platform's `targets` outcome. */
  get(id: Ulid, options?: RequestOptions): Promise<SocialPost> {
    return this.getOne<SocialPost>(
      this.api(`/social-posts/${this.encode(id)}`),
      undefined,
      options,
    );
  }

  /** Create from a raw payload. Prefer {@link schedule} / {@link draft}. */
  create(params: CreateSocialPostParams, options?: RequestOptions): Promise<SocialPost> {
    return this.mutate<SocialPost>('post', this.api('/social-posts'), params, options);
  }

  /**
   * Schedule a post to publish at `scheduledAt` (ISO-8601). Pass `null` to
   * save it as a draft instead.
   *
   * ```ts
   * const post = await client.socialPosts.schedule(
   *   'New drop is live! 🎉',
   *   [xChannelId, telegramChannelId],
   *   '2026-07-20T09:00:00+00:00',
   *   [{ url: 'https://cdn.example.com/promo.jpg', type: 'image' }],
   * );
   * ```
   */
  schedule(
    text: string,
    channelIds: Ulid[],
    scheduledAt?: IsoDateTime | null,
    media: SocialPostMedia[] = [],
    options?: RequestOptions,
  ): Promise<SocialPost> {
    const params: CreateSocialPostParams = { text, channel_ids: [...channelIds] };

    if (scheduledAt) params.scheduled_at = scheduledAt;
    if (media.length > 0) params.media = media;

    return this.create(params, options);
  }

  /** Save a post as a draft — {@link schedule} without a publish time. */
  draft(
    text: string,
    channelIds: Ulid[],
    media: SocialPostMedia[] = [],
    options?: RequestOptions,
  ): Promise<SocialPost> {
    return this.schedule(text, channelIds, null, media, options);
  }
}
