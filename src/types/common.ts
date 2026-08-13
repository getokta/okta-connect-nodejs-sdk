/**
 * Shared unions and envelopes.
 *
 * Field names mirror the API's JSON exactly (snake_case). The rule across this
 * SDK: **anything that travels on the wire keeps the API's naming; anything
 * that configures the SDK is camelCase.** That keeps request/response types
 * checkable against the platform's own docs with no mental translation.
 *
 * Every string union is widened with `(string & {})`, so a value the platform
 * adds after this release still type-checks while editors keep autocompleting
 * the known ones.
 */

/** Allow forward-compatible values without losing autocomplete. */
// eslint-disable-next-line @typescript-eslint/ban-types
export type Loose<T extends string> = T | (string & {});

/** Single-record envelope: `{ "data": { ... } }`. */
export interface DataEnvelope<T> {
  data: T;
}

/** Flat collection envelope used by endpoints that don't paginate. */
export interface ListEnvelope<T> {
  data: T[];
}

/** ULID identifier, as every public resource exposes. */
export type Ulid = string;

/** ISO-8601 timestamp string, e.g. `2026-07-14T09:30:00+00:00`. */
export type IsoDateTime = string;

/** `YYYY-MM-DD` date string. */
export type IsoDate = string;

/**
 * Channel platform types, identical to the API's `type` field.
 * `whatsapp` is a filter-only family alias covering `cloud_api` + `baileys`.
 */
export type ChannelType = Loose<
  | 'cloud_api'
  | 'baileys'
  | 'embed'
  | 'telegram'
  | 'instagram_dm'
  | 'messenger'
  | 'twitter'
  | 'linkedin'
  | 'tiktok'
  | 'snapchat'
  | 'email'
>;

/** The `type` filter accepted by `channels.list()` — channel types plus the family alias. */
export type ChannelTypeFilter = ChannelType | 'whatsapp';

export type ChannelStatus = Loose<
  | 'pending'
  | 'connecting'
  | 'awaiting_scan'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'rate_limited'
  | 'qr_expired'
>;

/** Message payload types accepted by `POST /messages`. */
export type MessageType = Loose<'text' | 'image' | 'document' | 'audio' | 'video'>;

/** `in` = inbound (received), `out` = outbound (sent). */
export type MessageDirection = Loose<'in' | 'out'>;

export type MessageStatus = Loose<'queued' | 'sent' | 'delivered' | 'read' | 'failed'>;

export type ConversationStatus = Loose<'open' | 'pending' | 'snoozed' | 'closed'>;

/** Which surface a conversation belongs to — DMs vs. public engagement threads. */
export type ConversationKind = Loose<'dm' | 'comment' | 'mention'>;

/** Meta's review state for a WhatsApp message template. */
export type TemplateStatus = Loose<
  'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED'
>;

export type CampaignStatus = Loose<
  'draft' | 'scheduled' | 'queueing' | 'running' | 'completed' | 'cancelled' | 'failed'
>;

export type SocialPostStatus = Loose<
  'draft' | 'scheduled' | 'publishing' | 'published' | 'partially_failed' | 'failed' | 'cancelled'
>;

export type SocialPostTargetStatus = Loose<
  'pending' | 'publishing' | 'published' | 'failed' | 'cancelled'
>;

/** A ticket's stage *category* — the API reports it as the ticket's `status`. */
export type TicketStatus = Loose<'open' | 'in_progress' | 'on_hold' | 'resolved' | 'closed'>;

export type TicketPriority = Loose<'low' | 'normal' | 'high' | 'urgent'>;

export type EmailStatus = Loose<
  'queued' | 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed'
>;

export type EmailBroadcastStatus = Loose<
  'draft' | 'scheduled' | 'queueing' | 'sending' | 'sent' | 'failed'
>;

export type SuppressionReason = Loose<'bounce' | 'complaint' | 'manual' | 'unsubscribe'>;

export type TagScope = Loose<'contact' | 'conversation'>;

/**
 * Token abilities the consent screen understands.
 *
 * - `read` — list/show everything the tenant surface exposes.
 * - `write` — mutate (contacts, tags, tickets, drafts, templates).
 * - `send` — dispatch outbound traffic (messages, email, queueing campaigns).
 * - `webhooks` — least-privilege scope for managing webhook subscriptions.
 * - `admin` — everything above.
 */
export type Ability = Loose<'read' | 'write' | 'send' | 'webhooks' | 'admin'>;

/** Common paging filters accepted by every `list()` endpoint. */
export interface PaginationParams {
  /** Page size, 1–100. Defaults vary per endpoint (25 or 50). */
  per_page?: number;
  /** 1-based page number. */
  page?: number;
}
