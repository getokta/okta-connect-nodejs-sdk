import type { HttpClient, Query, RequestOptions } from '../http/http-client.js';
import { Page, type PaginatedResponse } from '../http/pagination.js';
import type { DataEnvelope, ListEnvelope } from '../types/common.js';

/** Single source of truth for the API version prefix. */
const API_PREFIX = '/api/v1';

/**
 * Shared scaffolding for resource clients: path building, `data`-envelope
 * unwrapping, and the generic page-walking iterator every `listAll()` uses.
 */
export abstract class Resource {
  constructor(protected readonly http: HttpClient) {}

  /** Prefix a version-less path, e.g. `api('/tickets')` → `/api/v1/tickets`. */
  protected api(path: string): string {
    return `${API_PREFIX}/${path.replace(/^\/+/, '')}`;
  }

  /** Percent-encode a path segment so an odd id can't break out of the path. */
  protected encode(segment: string): string {
    return encodeURIComponent(segment);
  }

  /** GET a single record and unwrap `{ data: ... }`. */
  protected async getOne<T>(path: string, query?: Query, options?: RequestOptions): Promise<T> {
    const response = await this.http.get<DataEnvelope<T>>(path, query, options);

    return unwrap<T>(response.data);
  }

  /** POST/PATCH/PUT/DELETE a body and unwrap the returned record. */
  protected async mutate<T>(
    method: 'post' | 'patch' | 'put' | 'delete',
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<T> {
    const response = await this.http[method]<DataEnvelope<T>>(path, body, options);

    return unwrap<T>(response.data);
  }

  /** GET a paginated collection. */
  protected async getPage<T>(
    path: string,
    query?: Query,
    options?: RequestOptions,
  ): Promise<Page<T>> {
    const response = await this.http.get<PaginatedResponse<T>>(path, query, options);

    return new Page<T>(response.data);
  }

  /** GET a flat, non-paginated `{ data: [...] }` collection. */
  protected async getList<T>(
    path: string,
    query?: Query,
    options?: RequestOptions,
  ): Promise<T[]> {
    const response = await this.http.get<ListEnvelope<T>>(path, query, options);

    return Array.isArray(response.data?.data) ? response.data.data : [];
  }

  /**
   * Walk every page of a listing, yielding items one at a time. Stops as soon
   * as a page reports no successor, so the caller can `break` early without
   * fetching the rest.
   */
  protected async *paginate<T>(
    path: string,
    query: Query = {},
    options?: RequestOptions,
  ): AsyncGenerator<T, void, undefined> {
    let page = typeof query.page === 'number' ? query.page : 1;

    for (;;) {
      const result = await this.getPage<T>(path, { ...query, page }, options);

      yield* result.data;

      // Guard against a paginator that claims another page but returns none —
      // without this, a misreporting endpoint would spin forever.
      if (!result.hasMore || result.length === 0) return;

      page = result.nextPage ?? page + 1;
    }
  }

  /** Did a `{ "deleted": true }` style response confirm the removal? */
  protected confirmedDeleted(payload: unknown, key = 'deleted'): boolean {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      (payload as Record<string, unknown>)[key] === true
    );
  }
}

/** Pull the record out of `{ data: {...} }`, tolerating a bare object. */
function unwrap<T>(payload: DataEnvelope<T> | T | undefined): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const inner = (payload as DataEnvelope<T>).data;

    if (inner !== undefined && inner !== null) return inner;
  }

  return payload as T;
}
