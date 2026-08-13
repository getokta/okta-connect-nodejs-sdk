import type { RequestOptions } from '../http/http-client.js';
import type { Page } from '../http/pagination.js';
import type { Ulid } from '../types/common.js';
import type { Message, MessageListParams, SendMessageParams } from '../types/resources.js';
import { Resource } from './resource.js';

/**
 * `POST /api/v1/messages` — outbound sending, plus conversation-scoped reads.
 *
 * Sending needs a token with the `send` ability. The call queues the message
 * and returns it in `queued` status; track delivery by polling
 * {@link Messages.list} or by subscribing to the `message.*` webhooks.
 */
export class Messages extends Resource {
  /**
   * Send a raw payload. Prefer {@link sendText}, {@link sendMedia} or
   * {@link reply}, which build the correct shape for you.
   *
   * Address the message either by `channel_id` + `wa_id`, or by
   * `conversation_id` to reply into an existing thread.
   */
  send(params: SendMessageParams, options?: RequestOptions): Promise<Message> {
    return this.mutate<Message>('post', this.api('/messages'), params, options);
  }

  /**
   * Send plain text to a destination number, creating the contact and
   * conversation if they don't exist yet.
   *
   * @param channelId The ULID of the channel to send from.
   * @param waId Destination in E.164 **without** the leading `+`, e.g. `966500000000`.
   */
  sendText(
    channelId: Ulid,
    waId: string,
    body: string,
    options?: RequestOptions,
  ): Promise<Message> {
    return this.send({ channel_id: channelId, wa_id: waId, type: 'text', body }, options);
  }

  /**
   * Send media by public HTTPS URL, with an optional caption. The platform
   * never downloads the file — the URL is handed to the provider, which
   * fetches it — so it must stay reachable until delivery.
   */
  sendMedia(
    channelId: Ulid,
    waId: string,
    type: 'image' | 'document' | 'audio' | 'video',
    mediaUrl: string,
    caption = '',
    options?: RequestOptions,
  ): Promise<Message> {
    return this.send(
      { channel_id: channelId, wa_id: waId, type, body: caption, media_url: mediaUrl },
      options,
    );
  }

  /** Reply into an existing conversation by its ULID. */
  reply(conversationId: Ulid, body: string, options?: RequestOptions): Promise<Message> {
    return this.send({ conversation_id: conversationId, type: 'text', body }, options);
  }

  /**
   * List the messages of a conversation. `conversation_id` is required — the
   * API scopes message reads per thread.
   */
  list(params: MessageListParams, options?: RequestOptions): Promise<Page<Message>> {
    const { conversation_id: conversationId, ...query } = params;

    return this.getPage<Message>(this.messagesPath(conversationId), query, options);
  }

  /** Iterate every message in a conversation, transparently walking pages. */
  listAll(
    params: MessageListParams,
    options?: RequestOptions,
  ): AsyncGenerator<Message, void, undefined> {
    const { conversation_id: conversationId, ...query } = params;

    return this.paginate<Message>(this.messagesPath(conversationId), query, options);
  }

  private messagesPath(conversationId: Ulid): string {
    return this.api(`/conversations/${this.encode(conversationId)}/messages`);
  }
}
