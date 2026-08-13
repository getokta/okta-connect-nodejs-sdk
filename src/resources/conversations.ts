import type { RequestOptions } from '../http/http-client.js';
import type { Page } from '../http/pagination.js';
import type { PaginationParams, Ulid } from '../types/common.js';
import type { Conversation, ConversationListParams, Message } from '../types/resources.js';
import { Resource } from './resource.js';

/** `/api/v1/conversations` — the unified inbox, read-only over the public API. */
export class Conversations extends Resource {
  /** List conversations, optionally filtered by status and channel. */
  list(
    params: ConversationListParams = {},
    options?: RequestOptions,
  ): Promise<Page<Conversation>> {
    return this.getPage<Conversation>(this.api('/conversations'), { ...params }, options);
  }

  /** Iterate every conversation, transparently walking pages. */
  listAll(
    params: ConversationListParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<Conversation, void, undefined> {
    return this.paginate<Conversation>(this.api('/conversations'), { ...params }, options);
  }

  /** Fetch one conversation by ULID. */
  get(id: Ulid, options?: RequestOptions): Promise<Conversation> {
    return this.getOne<Conversation>(
      this.api(`/conversations/${this.encode(id)}`),
      undefined,
      options,
    );
  }

  /** List the messages in a conversation. */
  messages(
    id: Ulid,
    params: PaginationParams = {},
    options?: RequestOptions,
  ): Promise<Page<Message>> {
    return this.getPage<Message>(
      this.api(`/conversations/${this.encode(id)}/messages`),
      { ...params },
      options,
    );
  }

  /** Iterate every message in a conversation, transparently walking pages. */
  messagesAll(
    id: Ulid,
    params: PaginationParams = {},
    options?: RequestOptions,
  ): AsyncGenerator<Message, void, undefined> {
    return this.paginate<Message>(
      this.api(`/conversations/${this.encode(id)}/messages`),
      { ...params },
      options,
    );
  }
}
