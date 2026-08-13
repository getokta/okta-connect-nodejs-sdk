import type { RequestOptions } from '../http/http-client.js';
import type { CreateEmbedTokenParams, EmbedToken } from '../types/resources.js';
import { Resource } from './resource.js';

/**
 * `/api/v1/embed-tokens` — mint a signed visitor token for the white-label
 * embedded chat widget.
 *
 * Admin-only (`admin` or `write`): minting a token grants access to the chat
 * surface, so issue one per visitor, server-side, and keep the TTL short.
 *
 * Not to be confused with `client.embed(secret)`, which mints *operator*
 * tokens for the embedded inbox without an API round-trip.
 */
export class EmbedTokens extends Resource {
  /**
   * Issue a token for one visitor of a widget config.
   *
   * ```ts
   * const { token, expires_in } = await client.embedTokens.create({
   *   slug: 'marketing-site',
   *   subject: 'user-12345',
   *   ttl_seconds: 900,
   * });
   * ```
   */
  create(params: CreateEmbedTokenParams, options?: RequestOptions): Promise<EmbedToken> {
    return this.mutate<EmbedToken>('post', this.api('/embed-tokens'), params, options);
  }
}
