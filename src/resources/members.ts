import type { RequestOptions } from '../http/http-client.js';
import type { Page } from '../http/pagination.js';
import type {
  Member,
  MemberListParams,
  MemberUpsertResult,
  UpdateMemberParams,
  UpsertMemberParams,
} from '../types/resources.js';
import { Resource } from './resource.js';

/**
 * `/api/v1/members` — the people of the workspace, managed by your system.
 *
 * When your product adds an employee, add them here too with the id you know
 * them by. From then on, pass that id as the `sender` of a message
 * (`ext:<your id>`) and it is recorded — in the inbox, in the API and in
 * webhooks — under their name instead of under the token's owner.
 *
 * Reading needs any ability; changing needs `members` (or `admin`). Members
 * added this way cannot sign in on their own.
 *
 * A member is referenced by Connect's id, by `ext:<your id>`, or by e-mail.
 */
export class Members extends Resource {
  list(params: MemberListParams = {}, options?: RequestOptions): Promise<Page<Member>> {
    return this.getPage<Member>(this.api('/members'), { ...params }, options);
  }

  /** Iterate every member, transparently walking pages. */
  listAll(
    params: MemberListParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<Member, void, undefined> {
    return this.paginate<Member>(this.api('/members'), { ...params }, options);
  }

  /**
   * Create the member, or update the one already there.
   *
   * Idempotent on `external_id`, then on `email` — call it every time the
   * person changes on your side. Only the fields you pass are touched: a
   * repeat call never undoes a role set by hand in the dashboard and never
   * re-activates someone who was suspended.
   *
   * ```ts
   * const { member, created } = await client.members.upsert({ external_id: 'emp-41', name: 'Sara' });
   * await client.messages.sendText(channelId, '966500000000', 'Hello', { sender: Members.external('emp-41') });
   * ```
   */
  async upsert(params: UpsertMemberParams, options?: RequestOptions): Promise<MemberUpsertResult> {
    const response = await this.http.put<{ data: Member }>(this.api('/members'), params, options);

    return {
      member: response.data?.data ?? ({} as Member),
      // 201 created them, 200 found them.
      created: response.status === 201,
    };
  }

  get(reference: string, options?: RequestOptions): Promise<Member> {
    return this.getOne<Member>(this.path(reference), undefined, options);
  }

  /** `status: 'suspended'` keeps the member but refuses them as a `sender`. */
  update(reference: string, changes: UpdateMemberParams, options?: RequestOptions): Promise<Member> {
    return this.mutate<Member>('patch', this.path(reference), changes, options);
  }

  /** End the membership. Messages they sent keep their name. */
  async remove(reference: string, options?: RequestOptions): Promise<void> {
    await this.http.delete(this.path(reference), undefined, options);
  }

  /** The reference for a member you know by your own id. */
  static external(externalId: string): string {
    return `ext:${externalId}`;
  }

  private path(reference: string): string {
    // Slashes stay: an external id may contain them, and the route takes the rest of the path.
    return this.api(`/members/${this.encode(reference).replace(/%2F/gi, '/')}`);
  }
}
