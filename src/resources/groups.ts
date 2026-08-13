import type { RequestOptions } from '../http/http-client.js';
import type { Ulid } from '../types/common.js';
import type {
  CreateGroupParams,
  GroupParticipantResult,
  UpdateGroupParams,
  WhatsAppGroup,
} from '../types/resources.js';
import { Resource } from './resource.js';

/**
 * `/api/v1/groups` — WhatsApp groups. **Baileys channels only**; Cloud API
 * has no group-management surface.
 *
 * Every mutating call round-trips the platform → gateway → WhatsApp, so the
 * returned group reflects ground truth at that moment. Listings stay light;
 * call {@link get} for the participant roster.
 *
 * Reads need `read`; the rest need `write`, because they act on the live group
 * in the operator's WhatsApp account.
 */
export class Groups extends Resource {
  /** List the org's groups (up to 100, newest first). Participants omitted. */
  list(options?: RequestOptions): Promise<WhatsAppGroup[]> {
    return this.getList<WhatsAppGroup>(this.api('/groups'), undefined, options);
  }

  /** Fetch one group, including its participants. */
  get(id: Ulid, options?: RequestOptions): Promise<WhatsAppGroup> {
    return this.getOne<WhatsAppGroup>(this.api(`/groups/${this.encode(id)}`), undefined, options);
  }

  /**
   * Create a group and invite the given numbers (digits only, no `+`).
   *
   * ```ts
   * const group = await client.groups.create('Sales pod', ['966500000000', '966500000001']);
   * ```
   */
  create(
    subject: string,
    participants: string[],
    channelId?: number,
    options?: RequestOptions,
  ): Promise<WhatsAppGroup> {
    const body: CreateGroupParams = { subject, participants };

    if (channelId !== undefined) body.channel_id = channelId;

    return this.mutate<WhatsAppGroup>('post', this.api('/groups'), body, options);
  }

  /** Rename a group and/or change its description. */
  update(id: Ulid, params: UpdateGroupParams, options?: RequestOptions): Promise<WhatsAppGroup> {
    return this.mutate<WhatsAppGroup>(
      'patch',
      this.api(`/groups/${this.encode(id)}`),
      params,
      options,
    );
  }

  /** Add members. Returns WhatsApp's per-number outcome. */
  addParticipants(
    id: Ulid,
    participants: string[],
    options?: RequestOptions,
  ): Promise<GroupParticipantResult[]> {
    return this.participantResults('post', id, participants, options);
  }

  /** Remove members. Returns WhatsApp's per-number outcome. */
  removeParticipants(
    id: Ulid,
    participants: string[],
    options?: RequestOptions,
  ): Promise<GroupParticipantResult[]> {
    return this.participantResults('delete', id, participants, options);
  }

  /** Set the group picture from a base64-encoded JPEG. */
  setPicture(id: Ulid, base64Image: string, options?: RequestOptions): Promise<WhatsAppGroup> {
    return this.mutate<WhatsAppGroup>(
      'put',
      this.api(`/groups/${this.encode(id)}/picture`),
      { picture_base64: base64Image },
      options,
    );
  }

  /**
   * Force a roster refresh from the gateway — use it after an out-of-band
   * change (someone joined or left via the WhatsApp app) left the local
   * participant list stale.
   */
  sync(id: Ulid, options?: RequestOptions): Promise<WhatsAppGroup> {
    return this.mutate<WhatsAppGroup>(
      'post',
      this.api(`/groups/${this.encode(id)}/sync`),
      {},
      options,
    );
  }

  private async participantResults(
    method: 'post' | 'delete',
    id: Ulid,
    participants: string[],
    options?: RequestOptions,
  ): Promise<GroupParticipantResult[]> {
    const response = await this.http[method]<{ data?: { results?: GroupParticipantResult[] } }>(
      this.api(`/groups/${this.encode(id)}/participants`),
      { participants },
      options,
    );

    const results = response.data?.data?.results;

    return Array.isArray(results) ? results : [];
  }
}
