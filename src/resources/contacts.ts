import type { RequestOptions } from '../http/http-client.js';
import type { Page } from '../http/pagination.js';
import type { Ulid } from '../types/common.js';
import type { Contact, ContactListParams, ContactUpsertParams } from '../types/resources.js';
import { Resource } from './resource.js';

/**
 * `/api/v1/contacts` — the CRM address book.
 *
 * Reads need `read`; {@link upsert} and {@link applyTags} need `write`.
 */
export class Contacts extends Resource {
  /** List contacts, newest first. */
  list(params: ContactListParams = {}, options?: RequestOptions): Promise<Page<Contact>> {
    return this.getPage<Contact>(this.api('/contacts'), { ...params }, options);
  }

  /** Iterate every contact, transparently walking pages. */
  listAll(
    params: ContactListParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<Contact, void, undefined> {
    return this.paginate<Contact>(this.api('/contacts'), { ...params }, options);
  }

  /** Fetch one contact by ULID. */
  get(id: Ulid, options?: RequestOptions): Promise<Contact> {
    return this.getOne<Contact>(this.api(`/contacts/${this.encode(id)}`), undefined, options);
  }

  /**
   * Create or update a contact. The upsert is keyed on `(organization, wa_id)`,
   * so `wa_id` is required — pass the number in E.164 **without** the leading
   * `+`. Attributes you send overwrite the stored ones; omitted fields are left
   * alone.
   *
   * ```ts
   * await client.contacts.upsert({ wa_id: '966500000000', name: 'Ali', phone: '+966500000000' });
   * ```
   */
  upsert(params: ContactUpsertParams, options?: RequestOptions): Promise<Contact> {
    return this.mutate<Contact>('post', this.api('/contacts'), params, options);
  }

  /**
   * Apply tag slugs to a contact — slugs that don't exist yet are created.
   * Returns the updated contact with its tags loaded.
   */
  applyTags(id: Ulid, slugs: string[], options?: RequestOptions): Promise<Contact> {
    return this.mutate<Contact>(
      'post',
      this.api(`/contacts/${this.encode(id)}/tags`),
      { tags: slugs },
      options,
    );
  }
}
