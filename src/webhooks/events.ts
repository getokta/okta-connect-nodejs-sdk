import type {
  ChannelStatus,
  ChannelType,
  ConversationKind,
  IsoDateTime,
  Loose,
  MessageDirection,
  MessageStatus,
  MessageType,
  Ulid,
} from '../types/common.js';

/**
 * Outbound webhook event names, identical to the platform's dotted strings.
 *
 * Use `'*'` to subscribe to everything:
 *
 * ```ts
 * await client.webhooks.create({
 *   name: 'Lifecycle',
 *   url: 'https://example.test/hooks/okta',
 *   events: [WebhookEvents.SubscriptionExpired, WebhookEvents.ChannelDeleted],
 * });
 * ```
 */
export const WebhookEvents = {
  All: '*',

  // Messaging
  MessageReceived: 'message.received',
  MessageSent: 'message.sent',
  MessageDelivered: 'message.delivered',
  MessageRead: 'message.read',
  MessageFailed: 'message.failed',

  // Conversations
  ConversationOpened: 'conversation.opened',
  ConversationAssigned: 'conversation.assigned',
  ConversationClosed: 'conversation.closed',

  // Channel lifecycle
  ChannelConnected: 'channel.connected',
  ChannelDisconnected: 'channel.disconnected',
  ChannelDeleted: 'channel.deleted',

  // Subscription lifecycle (billing)
  SubscriptionActivated: 'subscription.activated',
  SubscriptionCancelled: 'subscription.cancelled',
  SubscriptionExpired: 'subscription.expired',
  SubscriptionPastDue: 'subscription.past_due',

  // Email delivery
  EmailDelivered: 'email.delivered',
  EmailBounced: 'email.bounced',
  EmailComplained: 'email.complained',
  EmailOpened: 'email.opened',
  EmailClicked: 'email.clicked',

  /**
   * A connected app's access was revoked — by the app itself
   * (`payload.source === 'app'`) or by the workspace (`'workspace'`).
   */
  ConnectionRevoked: 'connection.revoked',
} as const;

/** Every event name this SDK version knows about. */
export type KnownWebhookEvent = (typeof WebhookEvents)[keyof typeof WebhookEvents];

/** An event name — widened so a newly-added platform event still type-checks. */
export type WebhookEventName = Loose<KnownWebhookEvent>;

/** Family wildcards accepted by the router, e.g. `message.*`. */
export type WebhookEventPattern = WebhookEventName | `${string}.*`;

// ---------------------------------------------------------------------------
// Payload shapes, per family
// ---------------------------------------------------------------------------

export interface MessageEventPayload {
  message?: {
    id?: Ulid;
    direction?: MessageDirection;
    type?: MessageType;
    body?: string | null;
    status?: MessageStatus;
    is_reply?: boolean;
    reply_to?: { message_id?: Ulid | null } | null;
    provider_message_id?: string | null;
    [key: string]: unknown;
  };
  conversation?: { id?: Ulid; kind?: ConversationKind; [key: string]: unknown };
  channel?: { id?: Ulid; type?: ChannelType; name?: string | null; [key: string]: unknown };
  contact?: { name?: string | null; phone?: string | null; [key: string]: unknown };
  [key: string]: unknown;
}

export interface ChannelEventPayload {
  channel_id?: Ulid;
  type?: ChannelType;
  display_name?: string | null;
  status?: ChannelStatus;
  previous_status?: ChannelStatus;
  [key: string]: unknown;
}

export interface SubscriptionEventPayload {
  subscription_id?: Ulid;
  id?: Ulid;
  status?: string;
  plan?: string;
  plan_key?: string;
  current_period_end?: IsoDateTime;
  ends_at?: IsoDateTime;
  [key: string]: unknown;
}

export interface ConnectionRevokedPayload {
  /** Who severed the link. */
  source?: 'app' | 'workspace';
  [key: string]: unknown;
}

/**
 * The payload of an event whose family isn't known statically.
 *
 * Every family's fields are present but optional, so `hook.payload.message?.body`
 * and `hook.payload.channel_id` both read cleanly off a delivery you haven't
 * narrowed yet — no cast, no `switch` gymnastics. Handlers registered for a
 * specific event or family (see {@link WebhookPayloadMap} and the router's
 * `onMessage` / `onChannel` / `onSubscription`) receive the precise type instead.
 */
export interface WebhookPayload {
  // message.*
  message?: MessageEventPayload['message'];
  conversation?: MessageEventPayload['conversation'];
  contact?: MessageEventPayload['contact'];
  channel?: MessageEventPayload['channel'];

  // channel.*
  channel_id?: Ulid;
  type?: ChannelType;
  display_name?: string | null;
  previous_status?: ChannelStatus;

  // subscription.*
  subscription_id?: Ulid;
  id?: Ulid;
  plan?: string;
  plan_key?: string;
  current_period_end?: IsoDateTime;
  ends_at?: IsoDateTime;

  /** Channel connection state, or subscription state, depending on the family. */
  status?: string;

  // connection.revoked
  source?: 'app' | 'workspace';

  [key: string]: unknown;
}

/**
 * Maps each known event to the payload it carries, so a handler registered for
 * one event is typed against that event's shape.
 */
export interface WebhookPayloadMap {
  'message.received': MessageEventPayload;
  'message.sent': MessageEventPayload;
  'message.delivered': MessageEventPayload;
  'message.read': MessageEventPayload;
  'message.failed': MessageEventPayload;
  'message.*': MessageEventPayload;

  'channel.connected': ChannelEventPayload;
  'channel.disconnected': ChannelEventPayload;
  'channel.deleted': ChannelEventPayload;
  'channel.*': ChannelEventPayload;

  'subscription.activated': SubscriptionEventPayload;
  'subscription.cancelled': SubscriptionEventPayload;
  'subscription.expired': SubscriptionEventPayload;
  'subscription.past_due': SubscriptionEventPayload;
  'subscription.*': SubscriptionEventPayload;

  'connection.revoked': ConnectionRevokedPayload;
}

/** The payload type for `E`, falling back to the open shape for anything else. */
export type PayloadFor<E> = E extends keyof WebhookPayloadMap
  ? WebhookPayloadMap[E]
  : WebhookPayload;

/**
 * The envelope the platform POSTs to your endpoint, alongside the headers
 * `X-Okta-Signature`, `X-Okta-Event` and `X-Okta-Delivery`.
 */
export interface WebhookDelivery<P = WebhookPayload> {
  event: WebhookEventName;
  organization_id: number | null;
  payload: P;
  delivery_id: string | null;
  sent_at: IsoDateTime | null;
}
