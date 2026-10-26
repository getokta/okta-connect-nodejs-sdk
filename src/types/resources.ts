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
  Loose,
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
  /**
   * Whether the channel can carry WhatsApp message templates. Templates live
   * on a WABA, so only a `cloud_api` channel with a `waba_id` qualifies — a
   * QR-paired number has nowhere to send the definition. Pick the channel
   * from this flag instead of guessing. Absent on platforms before 2026-09.
   */
  supports_templates?: boolean;
  waba_id?: string | null;
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
  /** The merchant's own folder; `null` when unfiled. */
  group?: string | null;
  /** The library preset this template was created from; `null` = written by hand. */
  preset_key?: string | null;
  /**
   * The channel the template was authored against. Submit it through THAT
   * channel's WABA, not the workspace default.
   */
  channel_id?: Ulid | null;
  header_type: string | null;
  header_text: string | null;
  body_text: string | null;
  footer_text: string | null;
  buttons: unknown[] | null;
  /** One sample per `{{N}}` — send them back with any edit; Meta requires them. */
  example_variables?: string[] | null;
  created_at: IsoDateTime | null;
}

export type TemplateCategory = Loose<'UTILITY' | 'MARKETING' | 'AUTHENTICATION'>;

export interface TemplateListParams {
  status?: TemplateStatus;
  /** Language code, e.g. `ar`. */
  language?: string;
  /** `UTILITY`, `MARKETING` or `AUTHENTICATION` — any case. */
  category?: TemplateCategory;
  /** The merchant's folder. */
  group?: string;
  /** Only templates created from this library preset. */
  preset_key?: string;
}

/**
 * `POST /templates` — create or update a DRAFT. Re-posting an existing
 * (`name`, `language`) pair updates that template.
 */
export interface SaveTemplateParams {
  /** Lowercase letters, digits and underscores. */
  name: string;
  language: string;
  /** Body with sequential `{{1}}`, `{{2}}` placeholders. */
  body_text: string;
  category?: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION' | null;
  /** Channel ULID owning the WABA. */
  channel_id?: Ulid | null;
  header_type?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null;
  header_text?: string | null;
  footer_text?: string | null;
  /** One example per `{{N}}` — Meta rejects a template without them. */
  example_variables?: string[] | null;
  /** Folder (≤60 chars). Omit to keep the current one; `null` or `''` clears it. */
  group?: string | null;
}

// ---------------------------------------------------------------------------
// Template library (presets)
// ---------------------------------------------------------------------------

export type TemplatePresetCategory = Loose<'utility' | 'marketing' | 'authentication'>;

/** One language version of a preset, in the same field names as `Template`. */
export interface TemplatePresetVariant {
  language: string;
  header_type: string | null;
  header_text: string | null;
  body_text: string;
  footer_text: string | null;
  buttons: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
  example_variables: string[];
  /** Number of `{{N}}` placeholders in the body. */
  variable_count: number;
}

/**
 * A ready-made template written to pass Meta's review rules. `title`,
 * `description` and `group_label` are translated into the caller's locale.
 */
export interface TemplatePreset {
  /** What `templates.createFromPreset()` takes. */
  key: string;
  /** The Meta template name a copy is stored under (suffixed `_2`… when taken). */
  name: string;
  /** Library section: `general`, `commerce`, `support`, or a module's own. */
  group: string;
  group_label: string;
  category: TemplatePresetCategory;
  title: string;
  description: string;
  languages: string[];
  /** Narrowed to one entry when the list was filtered by `language`. */
  variants: TemplatePresetVariant[];
}

export interface TemplatePresetListParams {
  /** `utility`, `marketing` or `authentication` (upper-case is accepted too). */
  category?: TemplatePresetCategory;
  group?: string;
  /** Only presets with this language — and only that variant. */
  language?: string;
}

export interface CreateTemplateFromPresetParams {
  /** Variant to use; defaults to the preset's first (Arabic). */
  language?: string;
  /** Channel ULID owning the WABA. */
  channel_id?: Ulid;
  /** Override the name. One already taken is refused (422) instead of suffixed. */
  name?: string;
  /** The merchant's folder. */
  group?: string;
  /** Submit to Meta for review straight away. */
  submit?: boolean;
}

/** Outcome of the immediate submission requested with `submit: true`. */
export interface TemplateSubmission {
  submitted: boolean;
  /** e.g. `no_template_capable_channel` when nothing in the workspace has a WABA. */
  error: string | null;
}

export interface TemplateFromPreset {
  /** Always created, even when submission failed. */
  template: Template;
  /** `null` when submission was not requested. */
  submission: TemplateSubmission | null;
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

/**
 * Why a pairing session stopped making progress. `null` means it has not —
 * keep polling.
 *
 * Only `gateway_unavailable` is worth retrying: the gateway is unreachable or
 * refusing and recovers on its own. The rest need a **new** session, except
 * `disconnected`, which means the channel linked and has since dropped.
 */
export type QrSessionError =
  | 'gateway_unavailable'
  | 'pairing_failed'
  | 'qr_expired'
  | 'disconnected';

export interface QrSession {
  id?: Ulid;
  channel_id?: Ulid;
  status?: ChannelStatus;
  /** The QR payload to render; refreshed as the platform rotates it. */
  qr?: string | null;
  expires_in?: number | null;
  /** Same value as `expires_in` — the platform emits both key names. */
  qr_ttl_seconds?: number | null;
  /** The field to branch on while polling. See {@link QrSessionError}. */
  error?: QrSessionError | string | null;
  /** The enveloped shape the platform emits alongside the flat keys. */
  channel?: {
    id?: Ulid;
    display_name?: string | null;
    status?: ChannelStatus;
  };
  [key: string]: unknown;
}
