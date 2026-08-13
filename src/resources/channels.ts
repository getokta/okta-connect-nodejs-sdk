import type { RequestOptions } from '../http/http-client.js';
import type { Page } from '../http/pagination.js';
import type { ChannelStatus, ChannelTypeFilter, Ulid } from '../types/common.js';
import type { Channel, ChannelListParams } from '../types/resources.js';
import { Resource } from './resource.js';

/**
 * `/api/v1/channels` — the connected platform links (WhatsApp, Telegram,
 * Instagram, X, TikTok, email …).
 *
 * Provisioning happens in the dashboard (or through the Embedded Signup / QR
 * integration flows); the public API exposes reads plus teardown, so callers
 * can prune stale links.
 */
export class Channels extends Resource {
  /**
   * List channels. `type` takes a channel type or the family alias `whatsapp`
   * (which covers `cloud_api` + `baileys`); `status` filters by connection state.
   */
  list(params: ChannelListParams = {}, options?: RequestOptions): Promise<Page<Channel>> {
    return this.getPage<Channel>(this.api('/channels'), { ...params }, options);
  }

  /** Iterate every channel, transparently walking pages. */
  listAll(
    params: ChannelListParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<Channel, void, undefined> {
    return this.paginate<Channel>(this.api('/channels'), { ...params }, options);
  }

  /** Fetch one channel by ULID. */
  get(id: Ulid, options?: RequestOptions): Promise<Channel> {
    return this.getOne<Channel>(this.api(`/channels/${this.encode(id)}`), undefined, options);
  }

  /**
   * Delete a channel: disconnects it (stopping any live gateway session),
   * emits `channel.deleted`, then removes it. Needs `write` (or `admin`).
   *
   * @returns `true` once the platform confirms the removal.
   */
  async delete(id: Ulid, options?: RequestOptions): Promise<boolean> {
    const response = await this.http.delete<{ deleted?: boolean }>(
      this.api(`/channels/${this.encode(id)}`),
      undefined,
      options,
    );

    return this.confirmedDeleted(response.data);
  }

  /** Channels of one platform type, optionally narrowed by status. */
  listByType(
    type: ChannelTypeFilter,
    status?: ChannelStatus,
    params: ChannelListParams = {},
    options?: RequestOptions,
  ): Promise<Page<Channel>> {
    return this.list({ ...params, type, ...(status ? { status } : {}) }, options);
  }

  /** WhatsApp channels of either flavour — Cloud API and Baileys. */
  whatsapp(status?: ChannelStatus, options?: RequestOptions): Promise<Page<Channel>> {
    return this.listByType('whatsapp', status, {}, options);
  }

  /** Connected channels, optionally narrowed to one type. */
  connected(type?: ChannelTypeFilter, options?: RequestOptions): Promise<Page<Channel>> {
    return type
      ? this.listByType(type, 'connected', {}, options)
      : this.list({ status: 'connected' }, options);
  }

  /** Disconnected channels, optionally narrowed to one type. */
  disconnected(type?: ChannelTypeFilter, options?: RequestOptions): Promise<Page<Channel>> {
    return type
      ? this.listByType(type, 'disconnected', {}, options)
      : this.list({ status: 'disconnected' }, options);
  }

  /**
   * Channels stuck awaiting a QR scan — Baileys links whose QR was never
   * scanned. Combine with {@link delete} to prune them:
   *
   * ```ts
   * for await (const stale of client.channels.listAll({ status: 'awaiting_scan' })) {
   *   await client.channels.delete(stale.id);
   * }
   * ```
   */
  awaitingScan(type?: ChannelTypeFilter, options?: RequestOptions): Promise<Page<Channel>> {
    return type
      ? this.listByType(type, 'awaiting_scan', {}, options)
      : this.list({ status: 'awaiting_scan' }, options);
  }
}
