import { OktaConnect } from '../client.js';
import { normaliseBaseUrl, resolveConfig, type ClientOptions } from '../config.js';
import { Embed } from '../embed.js';
import { InvalidArgumentError } from '../http/errors.js';
import type { RequestOptions } from '../http/http-client.js';
import type { PartnerIdentity, PartnerWorkspaceToken } from '../types/partner.js';
import { PartnerHttp } from './partner-http.js';
import {
  PartnerEmbed,
  PartnerSso,
  PartnerWorkspaceChannels,
  PartnerWorkspaces,
  PartnerWorkspaceTokens,
  PartnerWorkspaceUsers,
} from './resources.js';
import { PartnerTokenStore } from './token-store.js';

export interface PartnerClientOptions extends Omit<ClientOptions, 'token'> {
  /** Production: the key pair from `/app/partner`. */
  clientId?: string;
  clientSecret?: string;
  /** Narrow the minted token relative to the key. Never widens it. */
  abilities?: string[];
  /** Development: the long-lived static token, used verbatim. */
  staticToken?: string;
}

/**
 * The Partner API client — the surface a **technical partner** (شريك تقني)
 * uses to wire Okta Connect into its own product.
 *
 * Deliberately a separate object from {@link OktaConnect}, and not merely for
 * tidiness: a partner token is bound to the partner organization rather than
 * to a tenant, lives in its own store, and is rejected by the tenant API
 * exactly as a tenant token is rejected here. One object per credential keeps
 * that boundary visible instead of turning it into a 401 that reads like a bug.
 *
 * ```ts
 * const partner = new PartnerClient({
 *   baseUrl: 'https://connect.getokta.io',
 *   clientId: process.env.OKTA_PARTNER_CLIENT_ID,
 *   clientSecret: process.env.OKTA_PARTNER_CLIENT_SECRET,
 * });
 *
 * // Idempotent on external_id — safe to re-run after a timeout.
 * const { workspace, owner, created } = await partner.workspaces.create({
 *   name: 'Acme Support',
 *   external_id: 'acct_8891',
 *   owner: { name: 'Sara', email: 'sara@acme.test', password_auto: true },
 * });
 *
 * const token = await partner.tokens.create(workspace.id!, {
 *   name: 'Acme product sync',
 *   user_id: owner!.id!,
 *   abilities: ['read', 'send'],
 * });
 *
 * // …and the workspace's own data plane, with the token you just minted:
 * const client = partner.workspaceClient(token);
 * ```
 *
 * Token lifetime is handled for you: one in-flight exchange shared by every
 * concurrent caller, a re-exchange before the hour is up, and one retry on a
 * 401 that slips through anyway.
 */
export class PartnerClient {
  /** Workspaces you provision and manage. */
  readonly workspaces: PartnerWorkspaces;

  /** Membership of those workspaces. */
  readonly users: PartnerWorkspaceUsers;

  /** Tenant API tokens minted for those workspaces. */
  readonly tokens: PartnerWorkspaceTokens;

  /** Channels reserved inside those workspaces. */
  readonly channels: PartnerWorkspaceChannels;

  /** One-time sign-in links. */
  readonly sso: PartnerSso;

  /** Your embed signing key and framing allowlist. */
  readonly embed: PartnerEmbed;

  private readonly http: PartnerHttp;

  private readonly store: PartnerTokenStore;

  private readonly baseUrl: string;

  private identity?: PartnerIdentity;

  constructor(options: PartnerClientOptions) {
    const { clientId, clientSecret, abilities, staticToken, ...rest } = options;

    if (!staticToken && !(clientId && clientSecret)) {
      throw new InvalidArgumentError(
        'A PartnerClient needs either { clientId, clientSecret } or { staticToken } — '
          + 'both are issued from /app/partner.',
      );
    }

    // The resolved token is a placeholder: every partner request overrides the
    // Authorization header with a live bearer from the store. It exists only
    // because resolveConfig insists on one.
    const config = resolveConfig({ ...rest, token: staticToken ?? 'partner-key-pair' });

    this.baseUrl = config.baseUrl;
    this.store = new PartnerTokenStore(
      config,
      staticToken
        ? { staticToken }
        : { clientId: clientId as string, clientSecret: clientSecret as string, abilities },
    );

    this.http = new PartnerHttp(config, this.store);

    this.workspaces = new PartnerWorkspaces(this.http);
    this.users = new PartnerWorkspaceUsers(this.http);
    this.tokens = new PartnerWorkspaceTokens(this.http);
    this.channels = new PartnerWorkspaceChannels(this.http);
    this.sso = new PartnerSso(this.http);
    this.embed = new PartnerEmbed(this.http);
  }

  /**
   * Who this token belongs to and what it may do.
   *
   * Worth calling on boot: the cheapest proof a key is live and carries the
   * abilities a run is about to need — before that run half-completes and
   * leaves a workspace without its owner. Cached; pass `{ fresh: true }` to
   * re-read.
   */
  async me(options: RequestOptions & { fresh?: boolean } = {}): Promise<PartnerIdentity> {
    const { fresh, ...request } = options;

    if (fresh) this.identity = undefined;

    if (!this.identity) {
      const response = await this.http.get<{ data: PartnerIdentity }>(
        '/api/v1/partner/me',
        undefined,
        request,
      );

      this.identity = response.data?.data ?? (response.data as unknown as PartnerIdentity);
    }

    return this.identity;
  }

  /** Does the live token carry this ability? */
  async can(ability: string): Promise<boolean> {
    const me = await this.me();

    return (me.token?.abilities ?? []).includes(ability);
  }

  /**
   * A tenant client for one of your workspaces, using a token you minted for
   * it. Closes the loop: provision here, act there, without hand-assembling a
   * second client and a second base URL.
   *
   * A token read back from a list carries no secret — the platform kept only a
   * hash — so passing one raises here rather than 401-ing three calls later.
   */
  workspaceClient(
    token: PartnerWorkspaceToken | string,
    options: Partial<ClientOptions> = {},
  ): OktaConnect {
    const plain = typeof token === 'string' ? token : token.token;

    if (!plain) {
      throw new InvalidArgumentError(
        'This workspace token carries no plain text. The secret is returned only on the mint '
          + 'response; a token read back from a list cannot build a client.',
      );
    }

    return new OktaConnect({ baseUrl: this.baseUrl, token: plain, ...options });
  }

  /**
   * An {@link Embed} signer already wired to **your** issuer.
   *
   * The issuer is derived, never typed: signing as `okta-web` is refused
   * server-side, and the browser renders that refusal as an inbox which
   * silently never signs in. Pass the secret from `embed.issueSecret()`; the
   * issuer is read from `/embed` when you do not supply one.
   */
  async embedSigner(secret: string, issuer?: string, audience?: string): Promise<Embed> {
    const resolved = issuer ?? (await this.embed.show()).issuer ?? partnerIssuer(await this.me());

    if (!resolved) {
      throw new InvalidArgumentError(
        'No embed issuer available — issue an embed key first: partner.embed.issueSecret().',
      );
    }

    return new Embed(this.baseUrl, secret, { issuer: resolved, audience });
  }

  /** The live bearer, exchanging one first if needed. */
  accessToken(): Promise<string> {
    return this.store.get();
  }

  /** Base URL this client talks to, normalised. */
  get endpoint(): string {
    return normaliseBaseUrl(this.baseUrl);
  }
}

function partnerIssuer(identity: PartnerIdentity): string | undefined {
  return identity.partner?.id ? `partner:${identity.partner.id}` : undefined;
}
