import { resolveConfig, type ClientOptions, type ResolvedConfig } from './config.js';
import { Connect, missingAbilities, type ConnectOptions } from './connect.js';
import { Embed, type EmbedOptions } from './embed.js';
import { HttpClient, type RequestOptions } from './http/http-client.js';
import { Analytics } from './resources/analytics.js';
import { Campaigns } from './resources/campaigns.js';
import { Channels } from './resources/channels.js';
import { Contacts } from './resources/contacts.js';
import { Conversations } from './resources/conversations.js';
import { Emails } from './resources/emails.js';
import { EmbedTokens } from './resources/embed-tokens.js';
import { Groups } from './resources/groups.js';
import { Meta, QrPairing } from './resources/integrations.js';
import { Messages } from './resources/messages.js';
import { SocialPosts } from './resources/social-posts.js';
import { Tags } from './resources/tags.js';
import { Templates } from './resources/templates.js';
import { Tickets } from './resources/tickets.js';
import { Webhooks } from './resources/webhooks.js';
import type { Ability } from './types/common.js';
import type { Connection } from './types/resources.js';

/**
 * The SDK entry point.
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
 * One instance is meant to live for the lifetime of your process: resources are
 * plain objects over a shared transport, and there is no connection state to
 * pool or dispose.
 *
 * Which calls succeed depends on the token's abilities — `read`, `write`,
 * `send`, `webhooks`, `admin`. A call the token isn't scoped for raises
 * `AuthorizationError` (403); {@link connection} tells you the grant up front.
 */
export class OktaConnect {
  /** Outbound sending + conversation-scoped message reads. */
  readonly messages: Messages;

  /** The unified inbox. */
  readonly conversations: Conversations;

  /** The CRM address book. */
  readonly contacts: Contacts;

  /** Connected platform links, and teardown. */
  readonly channels: Channels;

  /** Meta message templates: catalogue + send. */
  readonly templates: Templates;

  /** Outbound webhook subscriptions. */
  readonly webhooks: Webhooks;

  /** Transactional + bulk email, with nested templates/broadcasts/suppressions. */
  readonly emails: Emails;

  /** Social publishing: compose once, fan out to many platforms. */
  readonly socialPosts: SocialPosts;

  /** Broadcast messaging campaigns. */
  readonly campaigns: Campaigns;

  /** Support tickets. */
  readonly tickets: Tickets;

  /** CRM tags. */
  readonly tags: Tags;

  /** Read-only aggregate analytics. */
  readonly analytics: Analytics;

  /** WhatsApp groups (Baileys channels only). */
  readonly groups: Groups;

  /** Signed visitor tokens for the white-label chat widget. */
  readonly embedTokens: EmbedTokens;

  /** WhatsApp Embedded Signup, driven from your own UI. */
  readonly meta: Meta;

  /** QR pairing for businesses without a Cloud API setup. */
  readonly qr: QrPairing;

  private readonly config: ResolvedConfig;
  private readonly httpClient: HttpClient;

  constructor(options: ClientOptions = {}) {
    this.config = resolveConfig(options);
    this.httpClient = new HttpClient(this.config);

    this.messages = new Messages(this.httpClient);
    this.conversations = new Conversations(this.httpClient);
    this.contacts = new Contacts(this.httpClient);
    this.channels = new Channels(this.httpClient);
    this.templates = new Templates(this.httpClient);
    this.webhooks = new Webhooks(this.httpClient);
    this.emails = new Emails(this.httpClient);
    this.socialPosts = new SocialPosts(this.httpClient);
    this.campaigns = new Campaigns(this.httpClient);
    this.tickets = new Tickets(this.httpClient);
    this.tags = new Tags(this.httpClient);
    this.analytics = new Analytics(this.httpClient);
    this.groups = new Groups(this.httpClient);
    this.embedTokens = new EmbedTokens(this.httpClient);
    this.meta = new Meta(this.httpClient);
    this.qr = new QrPairing(this.httpClient);
  }

  /**
   * Start the OAuth-style connect flow — no token needed, since this is how you
   * get one.
   *
   * ```ts
   * const connect = OktaConnect.connect('https://connect.getokta.io');
   * const url = connect.authorizationUrl({ appName: 'My CRM', redirectUri, abilities: ['read', 'send'] });
   * ```
   */
  static connect(baseUrl: string, options?: ConnectOptions): Connect {
    return new Connect(baseUrl, options);
  }

  /** The resolved base URL this client talks to. */
  get baseUrl(): string {
    return this.config.baseUrl;
  }

  /** The underlying transport — for calling an endpoint the SDK doesn't wrap yet. */
  get http(): HttpClient {
    return this.httpClient;
  }

  /**
   * Introspect this token's grant: abilities, app name, bound workspace,
   * expiry, and the logo shown at connect time.
   *
   * ```ts
   * const conn = await client.connection();
   * if (!conn.abilities.includes('send')) {
   *   // send the user back through Connect with the fuller ability set
   * }
   * ```
   */
  connection(options?: RequestOptions): Promise<Connection> {
    return this.httpClient
      .get<{ data?: Connection } & Partial<Connection>>(
        '/api/v1/oauth/introspect',
        undefined,
        options,
      )
      .then((response) => {
        const payload = response.data;
        const connection = (payload?.data ?? payload ?? {}) as Connection;

        return { ...connection, abilities: connection.abilities ?? [] };
      });
  }

  /** Does this token hold `ability`? One round-trip to `/oauth/introspect`. */
  async can(ability: Ability, options?: RequestOptions): Promise<boolean> {
    const connection = await this.connection(options);

    return connection.abilities.includes(ability);
  }

  /**
   * Which of `wanted` this token is missing — the set to request by sending the
   * user back through Connect. Empty means the current grant already covers it.
   */
  async missing(wanted: Ability[], options?: RequestOptions): Promise<string[]> {
    const connection = await this.connection(options);

    return missingAbilities(connection.abilities, wanted);
  }

  /**
   * Disconnect this app from the workspace: revokes the token this client
   * holds, and fires a `connection.revoked` webhook (`source: "app"`).
   * Idempotent — every later call with this token gets 401.
   */
  async revokeConnection(options?: RequestOptions): Promise<boolean> {
    const response = await this.httpClient.post<{ revoked?: boolean }>(
      '/api/v1/oauth/revoke',
      {},
      options,
    );

    return response.data?.revoked === true;
  }

  /**
   * The embed surface for the iframe-embedded inbox — mints operator tokens
   * locally, with no API round-trip. The client's base URL is reused, so you
   * never re-type the host.
   *
   * Obtain `sharedSecret` from your platform operator (provisioned server-side
   * under the `embed.*` settings).
   *
   * ```ts
   * const src = client.embed(secret).inboxUrl({ sub: 'u-7', email: 'op@acme.com' });
   * ```
   */
  embed(sharedSecret: string, options?: EmbedOptions): Embed {
    return new Embed(this.config.baseUrl, sharedSecret, options);
  }
}
