/**
 * Laravel paginator envelope, as returned by every `list()` endpoint:
 *
 * ```json
 * {
 *   "data":  [ ...items ],
 *   "links": { "first": "...", "last": "...", "prev": null, "next": "..." },
 *   "meta":  { "current_page": 1, "per_page": 25, "total": 90, "last_page": 4 }
 * }
 * ```
 */
export interface PageMeta {
  current_page?: number;
  from?: number | null;
  last_page?: number;
  path?: string;
  per_page?: number;
  to?: number | null;
  total?: number;
  next_cursor?: string | null;
  prev_cursor?: string | null;
  [key: string]: unknown;
}

export interface PageLinks {
  first?: string | null;
  last?: string | null;
  prev?: string | null;
  next?: string | null;
  [key: string]: unknown;
}

export interface PaginatedResponse<T> {
  data?: T[];
  links?: PageLinks;
  meta?: PageMeta;
}

/**
 * One page of results. Iterable, so the common case reads naturally:
 *
 * ```ts
 * const page = await client.contacts.list({ per_page: 50 });
 * for (const contact of page) console.log(contact.name);
 * ```
 *
 * To walk every page, prefer the resource's `listAll()` async iterator — it
 * handles the page cursor for you.
 */
export class Page<T> implements Iterable<T> {
  readonly data: T[];
  readonly meta: PageMeta;
  readonly links: PageLinks;

  constructor(payload: PaginatedResponse<T> | undefined) {
    this.data = Array.isArray(payload?.data) ? payload.data : [];
    this.meta = payload?.meta ?? {};
    this.links = payload?.links ?? {};
  }

  /** Number of items on this page (not the total across all pages). */
  get length(): number {
    return this.data.length;
  }

  /** Total across all pages, when the paginator reports one. */
  get total(): number | undefined {
    return typeof this.meta.total === 'number' ? this.meta.total : undefined;
  }

  get currentPage(): number | undefined {
    return typeof this.meta.current_page === 'number' ? this.meta.current_page : undefined;
  }

  get lastPage(): number | undefined {
    return typeof this.meta.last_page === 'number' ? this.meta.last_page : undefined;
  }

  /** True when at least one more page exists. */
  get hasMore(): boolean {
    if (typeof this.links.next === 'string' && this.links.next !== '') return true;
    if (typeof this.meta.next_cursor === 'string' && this.meta.next_cursor !== '') return true;

    const current = this.currentPage;
    const last = this.lastPage;

    if (typeof current === 'number' && typeof last === 'number') return current < last;

    return false;
  }

  /** The `page` value to request next, or `undefined` when this is the last page. */
  get nextPage(): number | undefined {
    if (!this.hasMore) return undefined;

    const current = this.currentPage;

    return typeof current === 'number' ? current + 1 : undefined;
  }

  /** The first item, or `undefined` on an empty page. */
  first(): T | undefined {
    return this.data[0];
  }

  [Symbol.iterator](): Iterator<T> {
    return this.data[Symbol.iterator]();
  }
}
