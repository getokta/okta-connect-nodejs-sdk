/**
 * Official Node.js / TypeScript SDK for **Okta Connect** — the omnichannel
 * platform for WhatsApp messaging, transactional + bulk email, social
 * publishing and broadcast campaigns.
 *
 * ```ts
 * import { OktaConnect } from '@getokta/okta-connect-sdk';
 *
 * const client = new OktaConnect({
 *   baseUrl: 'https://connect.getokta.io',
 *   token: process.env.OKTA_CONNECT_TOKEN,
 * });
 *
 * await client.messages.sendText(channelId, '966500000000', 'Hello');
 * ```
 *
 * @packageDocumentation
 */

// --- Client -----------------------------------------------------------------
export { OktaConnect } from './client.js';
export { OktaConnect as Client } from './client.js';

export {
  resolveConfig,
  VERSION,
  type ClientOptions,
  type FetchLike,
  type ResolvedConfig,
  type RetryListener,
} from './config.js';

// --- Connect (OAuth-style one-click connect) --------------------------------
export {
  Connect,
  hasAbilities,
  missingAbilities,
  type AuthorizationUrlParams,
  type CallbackQuery,
  type ConnectOptions,
} from './connect.js';

// --- Embedded inbox ---------------------------------------------------------
export {
  Embed,
  EmbedScope,
  UiHide,
  validateUiHide,
  type EmbedMintOptions,
  type EmbedOptions,
  type EmbedScopeValue,
  type EmbedUser,
  type UiHideKey,
} from './embed.js';

// --- Email authoring --------------------------------------------------------
export { HtmlMessageBuilder } from './email/html-message-builder.js';

// --- Webhooks ---------------------------------------------------------------
export {
  WebhookEvents,
  type ChannelEventPayload,
  type ConnectionRevokedPayload,
  type KnownWebhookEvent,
  type MessageEventPayload,
  type PayloadFor,
  type SubscriptionEventPayload,
  type WebhookDelivery,
  type WebhookEventName,
  type WebhookEventPattern,
  type WebhookPayload,
  type WebhookPayloadMap,
} from './webhooks/events.js';

export {
  get as getWebhookValue,
  parseWebhook,
  verifyWebhookSignature,
  WEBHOOK_DELIVERY_HEADER,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
} from './webhooks/verify.js';

export { WebhookRouter, type WebhookHandler } from './webhooks/router.js';

// --- HTTP layer -------------------------------------------------------------
export {
  HttpClient,
  type HttpRequest,
  type HttpResponse,
  type Query,
  type QueryValue,
  type RequestOptions,
} from './http/http-client.js';

export {
  Page,
  type PageLinks,
  type PageMeta,
  type PaginatedResponse,
} from './http/pagination.js';

export {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  ConnectionError,
  InvalidArgumentError,
  NotFoundError,
  OktaConnectError,
  RateLimitError,
  ServerError,
  TimeoutError,
  ValidationError,
  WebhookSignatureError,
  type OktaConnectErrorOptions,
  type ValidationErrorMap,
} from './http/errors.js';

// --- Resource classes (for typing your own wrappers) ------------------------
export { Analytics } from './resources/analytics.js';
export { Campaigns } from './resources/campaigns.js';
export { Channels } from './resources/channels.js';
export { Contacts } from './resources/contacts.js';
export { Conversations } from './resources/conversations.js';
export { EmailBroadcasts } from './resources/email-broadcasts.js';
export { EmailSuppressions } from './resources/email-suppressions.js';
export { EmailTemplates } from './resources/email-templates.js';
export { Emails, type HtmlSource } from './resources/emails.js';
export { EmbedTokens } from './resources/embed-tokens.js';
export { Groups } from './resources/groups.js';
export { Meta, QrPairing } from './resources/integrations.js';
export { Messages } from './resources/messages.js';
export { Resource } from './resources/resource.js';
export { SocialPosts } from './resources/social-posts.js';
export { Tags } from './resources/tags.js';
export { Templates } from './resources/templates.js';
export { Tickets } from './resources/tickets.js';
export { Webhooks } from './resources/webhooks.js';

// --- Types ------------------------------------------------------------------
export type * from './types/common.js';
export type * from './types/resources.js';
