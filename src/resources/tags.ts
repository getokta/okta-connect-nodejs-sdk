import type { RequestOptions } from '../http/http-client.js';
import type { Page } from '../http/pagination.js';
import type { Ulid } from '../types/common.js';
import type { Contact, Tag, TagListParams } from '../types/resources.js';
import { Resource } from './resource.js';

/**
 * `/api/v1/tags` — CRM tags.
 *
 * Listing needs `read`; {@link applyToContact} needs `write`. Slugs that don't
 * exist yet are created on the fly, so you never have to pre-register a tag.
 */
export class Tags extends Resource {
  list(params: TagListParams = {}, options?: RequestOptions): Promise<Page<Tag>> {
    return this.getPage<Tag>(this.api('/tags'), { ...params }, options);
  }

  /** Iterate every tag, transparently walking pages. */
  listAll(
    params: TagListParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<Tag, void, undefined> {
    return this.paginate<Tag>(this.api('/tags'), { ...params }, options);
  }

  /**
   * Apply tag slugs to a contact, returning the updated contact with its tags.
   *
   * ```ts
   * await client.tags.applyToContact(contactId, ['vip', 'riyadh']);
   * ```
   */
  applyToContact(contactId: Ulid, slugs: string[], options?: RequestOptions): Promise<Contact> {
    return this.mutate<Contact>(
      'post',
      this.api(`/contacts/${this.encode(contactId)}/tags`),
      { tags: slugs },
      options,
    );
  }
}
