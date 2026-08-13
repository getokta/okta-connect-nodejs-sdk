import type {
  Ability,
  CampaignStatus,
  ChannelStatus,
  ChannelType,
  ChannelTypeFilter,
  ConversationStatus,
  EmailBroadcastStatus,
  EmailStatus,
  IsoDate,
  IsoDateTime,
  MessageDirection,
  MessageStatus,
  MessageType,
  PaginationParams,
  SocialPostStatus,
  SocialPostTargetStatus,
  SuppressionReason,
  TagScope,
  TemplateStatus,
  TicketPriority,
  TicketStatus,
  Ulid,
} from './common.js';

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export interface Contact {
  id: Ulid;
  /** E.164 without the leading `+` — the platform's identity key for a contact. */
  wa_id: string | null;
  /** Display phone, with `+`. */
  phone: string | null;
  name: string | null;
  email: string | null;
  /** Two-letter language hint, e.g. `ar`. */
  language: string | null;
  /** Tag slugs — present only when the endpoint eager-loads tags. */
  tags?: string[];
  last_seen_at: IsoDateTime | null;
  created_at: IsoDateTime | null;
}

export interface ContactListParams extends PaginationParams {
  /** Substring match against name, phone, or wa_id. */
  search?: string;
}

/**
 * Create-or-update payload. Idempotent on `(organization, wa_id)`, so `wa_id`
 * is required — it is the key the upsert matches on. Fields you omit are left
 * untouched; fields you send overwrite.
 */
export interface ContactUpsertParams {
  wa_id: string;
  phone?: string;
  name?: string;
  email?: string;
  language?: string;
  profile?: Record<string, unknown>;
  custom_fields?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export interface Channel {
  id: Ulid;
  type: ChannelType;
  status: ChannelStatus;
  display_name: string | null;
  phone_number: string | null;
  connected_at: IsoDateTime | null;
  last_seen_at: IsoDateTime | null;
}

export interface ChannelListParams extends PaginationParams {
  /** A channel type, or the family alias `whatsapp` (cloud_api + baileys). */
  type?: ChannelTypeFilter;
  status?: ChannelStatus;
}

// ---------------------------------------------------------------------------
// Conversations & messages
// ---------------------------------------------------------------------------

export interface Conversation {
  id: Ulid;
  status: ConversationStatus;
  priority: string | number | null;
  unread_count: number;
  channel_id: Ulid | null;
  contact_id: Ulid | null;
  assigned_user_id: number | null;
  last_message_at: IsoDateTime | null;
  created_at: IsoDateTime | null;
}

export interface ConversationListParams extends PaginationParams {
  status?: ConversationStatus;
  channel_id?: Ulid;
}

/** Attachment surface on a media message. */
export interface MessageMedia {
  url: string;
  mime_type: string | null;
  filename: string | null;
  size: number | null;
  /** True when the media is hosted elsewhere and was sent by link. */
  external?: boolean;
}

/** The agent (or system user) who composed an outbound message. */
export interface MessageSender {
  id: Ulid;
  name: string | null;
  email: string | null;
}

export interface Message {
  id: Ulid;
  conversation_id: Ulid | null;
  channel_id: Ulid | null;
  provider_message_id: string | null;
  direction: MessageDirection;
  type: MessageType;
  body: string | null;
  status: MessageStatus;
  sent_at: IsoDateTime | null;
  delivered_at: IsoDateTime | null;
  read_at: IsoDateTime | null;
  created_at: IsoDateTime | null;
  media: MessageMedia | null;
  sender: MessageSender | null;
}

/**
 * Send payload. Address it either by `channel_id` + `wa_id` (the contact and
 * conversation are created if needed) or by `conversation_id` to reply into an
 * existing thread.
 */
export interface SendMessageParams {
  /** Required when sending by `wa_id`. */
  channel_id?: Ulid;
  /** Destination in E.164 without `+`. Required unless `conversation_id` is set. */
  wa_id?: string;
  /** Reply into an existing conversation instead of addressing a number. */
  conversation_id?: Ulid;
  /** Defaults to `text` server-side. */
  type?: MessageType;
  /** Message text, or the caption for a media message. */
  body?: string;
  /** Publicly fetchable HTTPS URL, for image/document/audio/video. */
  media_url?: string;
}

export interface MessageListParams extends PaginationParams {
  /** Required — messages are listed per conversation. */
  conversation_id: Ulid;
}

// ---------------------------------------------------------------------------
// WhatsApp message templates (Meta)
// ---------------------------------------------------------------------------

export interface Template {
  id: Ulid;
  name: string;
  language: string | null;
  category: string | null;
  status: TemplateStatus;
  header_type: string | null;
  header_text: string | null;
  body_text: string | null;
  footer_text: string | null;
  buttons: unknown[] | null;
  created_at: IsoDateTime | null;
}

export interface TemplateListParams {
  status?: TemplateStatus;
  /** Language code, e.g. `ar`. */
  language?: string;
}

export interface SendTemplateParams {
  channel_id: Ulid;
  /** Destination in E.164 without `+`. */
  wa_id: string;
  /** Template name as registered with Meta. */
  template_name: string;
  /** Defaults to the template's primary language. */
  language?: string;
  /** Positional values for the body's `{{1}}`, `{{2}}`, … placeholders. */
  variables?: Array<string | number>;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export interface WebhookSubscription {
  id: Ulid;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  max_attempts: number;
  consecutive_failures: number;
  last_succeeded_at: IsoDateTime | null;
  last_failed_at: IsoDateTime | null;
  created_at: IsoDateTime | null;
  /**
   * The HMAC signing secret. Returned **only** on create — it is encrypted at
   * rest and never surfaced again, so persist it on the spot.
   */
  secret?: string;
}

export interface CreateWebhookParams {
  name: string;
  /** HTTPS endpoint that receives deliveries. */
  url: string;
  /** Event names to receive, or `['*']` for everything. */
  events: string[];
  /** Delivery attempts before giving up, 1–20. Defaults to 5. */
  max_attempts?: number;
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export interface Campaign {
  id: Ulid;
  name: string;
  type: string;
  status: CampaignStatus;
  channel_id: Ulid | null;
  template_id: Ulid | null;
  audience_size: number | null;
  queued_count: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  scheduled_at: IsoDateTime | null;
  started_at: IsoDateTime | null;
  finished_at: IsoDateTime | null;
  created_at: IsoDateTime | null;
}

export interface CampaignAudienceFilter {
  contact_ids?: Ulid[];
  tag_slugs?: string[];
}

export interface CreateCampaignParams {
  name: string;
  channel_id: Ulid;
  template_id?: Ulid;
  /** `bulk` (default) or `drip`. */
  type?: string;
  /** Omit to target every opted-in contact. */
  audience_filter?: CampaignAudienceFilter;
}

export interface CampaignListParams extends PaginationParams {
  status?: CampaignStatus;
}

// ---------------------------------------------------------------------------
// Social publishing
// ---------------------------------------------------------------------------

export interface SocialPostMedia {
  url: string;
  /** `image` or `video`. */
  type?: string;
  [key: string]: unknown;
}

/** Per-platform outcome of a fan-out. */
export interface SocialPostTarget {
  channel_id: Ulid | null;
  status: SocialPostTargetStatus;
  target_ref: string | null;
  permalink: string | null;
  provider_post_id: string | null;
  published_at: IsoDateTime | null;
}

export interface SocialPost {
  id: Ulid;
  status: SocialPostStatus;
  body: string | null;
  media: SocialPostMedia[] | null;
  options: Record<string, unknown> | null;
  scheduled_at: IsoDateTime | null;
  published_at: IsoDateTime | null;
  target_count: number;
  published_count: number;
  failed_count: number;
  created_at: IsoDateTime | null;
  /** Present when the endpoint eager-loads targets (always on `get()`). */
  targets?: SocialPostTarget[];
}

export interface CreateSocialPostParams {
  /** The post caption/body. */
  text: string;
  /** Channel ULIDs to fan the post out to. */
  channel_ids: Ulid[];
  /** ISO-8601 publish time. Omit to save as a draft. */
  scheduled_at?: IsoDateTime;
  media?: SocialPostMedia[];
}

export interface SocialPostListParams extends PaginationParams {
  status?: SocialPostStatus;
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export interface Ticket {
  id: Ulid;
  /** Per-organization sequence number. */
  number: number | string;
  subject: string;
  description: string | null;
  priority: TicketPriority;
  /** The current stage's category. */
  status: TicketStatus | null;
  stage_id: Ulid | null;
  /** Human-readable stage name. */
  stage: string | null;
  pipeline_id: Ulid | null;
  contact_id: Ulid | null;
  assigned_user_id: number | null;
  first_response_at: IsoDateTime | null;
  first_response_due_at: IsoDateTime | null;
  resolution_due_at: IsoDateTime | null;
  resolved_at: IsoDateTime | null;
  closed_at: IsoDateTime | null;
  created_at: IsoDateTime | null;
}

export interface OpenTicketParams {
  subject: string;
  description?: string;
  /** Defaults to the organization's default pipeline. */
  pipeline_id?: Ulid;
  contact_id?: Ulid;
  /** Defaults to `normal`. */
  priority?: TicketPriority;
}

export interface TransitionTicketParams {
  /** Target stage ULID — must belong to the ticket's pipeline. */
  stage_id: Ulid;
  note?: string;
}

export interface TicketListParams extends PaginationParams {
  /** Filter by stage category. */
  status?: TicketStatus;
  pipeline_id?: Ulid;
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export interface Tag {
  id: Ulid;
  name: string;
  slug: string;
  color: string | null;
  scope: TagScope;
  created_at: IsoDateTime | null;
}

export interface TagListParams extends PaginationParams {
  scope?: TagScope;
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface AnalyticsMetrics {
  from: IsoDate | null;
  to: IsoDate | null;
  platform: string | null;
  /** Metric key (e.g. `messages.inbound`) → summed value over the window. */
  metrics: Record<string, number>;
}

export interface AnalyticsMetricsParams {
  /** `YYYY-MM-DD`. Defaults to 30 days ago. */
  from?: IsoDate;
  /** `YYYY-MM-DD`. Defaults to today. */
  to?: IsoDate;
  /** Restrict to one platform, e.g. `telegram`, `instagram`, `x`. */
  platform?: string;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export interface EmailMessage {
  id: Ulid;
  /** `Name <addr@domain>` when a display name is set, else the bare address. */
  from: string;
  from_address: string;
  to: string[];
  cc: string[] | null;
  bcc: string[] | null;
  reply_to: string | null;
  subject: string | null;
  status: EmailStatus;
  message_id: string | null;
  provider_message_id: string | null;
  error: Record<string, unknown> | null;
  sent_at: IsoDateTime | null;
  delivered_at: IsoDateTime | null;
  created_at: IsoDateTime | null;
}

export interface SendEmailParams {
  /** `Name <addr@domain>` or a bare address on a verified sending domain. */
  from: string;
  to: string[];
  /** Ignored in favour of the rendered subject when `template` is set. */
  subject?: string;
  /** At least one of `html` / `text` / `template` is required. */
  html?: string;
  text?: string;
  /** An email template slug or ULID. */
  template?: string;
  /** Substituted into the template's `{{ key }}` placeholders. */
  variables?: Record<string, unknown>;
  cc?: string[];
  bcc?: string[];
  reply_to?: string;
  headers?: Record<string, string>;
}

export interface EmailListParams extends PaginationParams {
  status?: EmailStatus;
}

export interface EmailAnalyticsSummary {
  total?: number;
  queued?: number;
  sent?: number;
  delivered?: number;
  bounced?: number;
  complained?: number;
  failed?: number;
  delivery_rate?: number;
  bounce_rate?: number;
  [key: string]: unknown;
}

export interface EmailAnalytics {
  from: IsoDate | null;
  to: IsoDate | null;
  summary: EmailAnalyticsSummary;
  /** Per-day breakdown. */
  series: Array<Record<string, unknown>>;
}

export interface EmailAnalyticsParams {
  from?: IsoDate;
  to?: IsoDate;
}

export interface EmailTemplate {
  id: Ulid;
  name: string;
  slug: string;
  subject: string | null;
  variables: Record<string, unknown> | null;
  created_at: IsoDateTime | null;
}

export interface CreateEmailTemplateParams {
  name: string;
  /** Auto-derived from `name` when omitted. */
  slug?: string;
  /** May contain `{{ variable }}` placeholders. */
  subject?: string;
  html?: string;
  text?: string;
  variables?: Record<string, unknown>;
}

export type UpdateEmailTemplateParams = Partial<CreateEmailTemplateParams>;

export interface EmailBroadcast {
  id: Ulid;
  name: string;
  subject: string | null;
  status: EmailBroadcastStatus;
  queued_count: number;
  sent_count: number;
  failed_count: number;
  scheduled_at: IsoDateTime | null;
  created_at: IsoDateTime | null;
}

export interface EmailBroadcastAudience {
  tag_slugs?: string[];
  [key: string]: unknown;
}

export interface CreateEmailBroadcastParams {
  name: string;
  /** `Name <addr@domain>` or a bare address on a verified sending domain. */
  from: string;
  subject?: string;
  /** At least one of `html` / `text` is required. */
  html?: string;
  text?: string;
  /** Omit to target everyone with an email address. */
  audience?: EmailBroadcastAudience;
  scheduled_at?: IsoDateTime;
}

export interface EmailBroadcastListParams extends PaginationParams {
  status?: EmailBroadcastStatus;
}

export interface EmailSuppression {
  id: Ulid;
  address: string;
  reason: SuppressionReason;
  created_at: IsoDateTime | null;
}

export interface EmailSuppressionListParams extends PaginationParams {
  reason?: SuppressionReason;
}

// ---------------------------------------------------------------------------
// WhatsApp groups (Baileys-only)
// ---------------------------------------------------------------------------

export interface WhatsAppGroupParticipant {
  jid: string;
  phone: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: string | null;
  joined_at: IsoDateTime | null;
}

export interface WhatsAppGroup {
  id: Ulid;
  group_jid: string;
  subject: string;
  description: string | null;
  owner_jid: string | null;
  picture_url: string | null;
  /** Numeric internal channel id (not a ULID) on this endpoint. */
  channel_id: number | null;
  joined_at: IsoDateTime | null;
  /** Present on `get()` and `sync()`, omitted from listings. */
  participants?: WhatsAppGroupParticipant[];
}

/** Per-number outcome of an add/remove participants call. */
export interface GroupParticipantResult {
  jid: string;
  status: string;
  [key: string]: unknown;
}

export interface CreateGroupParams {
  subject: string;
  /** Phone numbers, digits only. */
  participants: string[];
  /** Numeric channel id; defaults to the org's connected Baileys channel. */
  channel_id?: number;
}

export interface UpdateGroupParams {
  subject?: string;
  description?: string | null;
}

// ---------------------------------------------------------------------------
// Connect (OAuth-style) + embed tokens
// ---------------------------------------------------------------------------

export interface AccessToken {
  access_token: string;
  token_type: string;
  abilities: Ability[];
  expires_at: IsoDateTime | null;
  [key: string]: unknown;
}

/** What `GET /oauth/introspect` reports about the calling token's grant. */
export interface Connection {
  app_name: string;
  logo_url: string | null;
  abilities: Ability[];
  organization: { id: Ulid; name: string } | null;
  expires_at: IsoDateTime | null;
  last_used_at: IsoDateTime | null;
  [key: string]: unknown;
}

/** A signed visitor token for the white-label embedded chat widget. */
export interface EmbedToken {
  token: string;
  expires_in: number;
  slug: string;
}

export interface CreateEmbedTokenParams {
  /** The widget config slug. */
  slug: string;
  /** Visitor reference — your own user id, session id, etc. */
  subject: string;
  /** Free-form context bag, max 4 KB serialised. */
  context?: Record<string, unknown>;
  /** Token lifetime in seconds, 60–86400. Defaults to 900. */
  ttl_seconds?: number;
}

// ---------------------------------------------------------------------------
// Integrations — Meta Embedded Signup + QR pairing
// ---------------------------------------------------------------------------

/** Meta JS SDK parameters needed to drive Embedded Signup from your own UI. */
export interface MetaConfig {
  app_id?: string;
  config_id?: string;
  graph_version?: string;
  [key: string]: unknown;
}

export interface EmbeddedSignupChannel {
  id?: Ulid;
  display_name?: string | null;
  phone_number?: string | null;
  status?: ChannelStatus;
  [key: string]: unknown;
}

export interface QrSession {
  id?: Ulid;
  channel_id?: Ulid;
  status?: ChannelStatus;
  /** The QR payload to render; refreshed as the platform rotates it. */
  qr?: string | null;
  expires_in?: number | null;
  [key: string]: unknown;
}
