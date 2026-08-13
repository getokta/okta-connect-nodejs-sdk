import { randomBytes, timingSafeEqual } from 'node:crypto';
import { normaliseBaseUrl, resolveConfig, type ClientOptions, type FetchLike } from './config.js';
import { InvalidArgumentError, OktaConnectError } from './http/errors.js';
import { HttpClient } from './http/http-client.js';
import type { Ability } from './types/common.js';
import type { AccessToken } from './types/resources.js';

/** The abilities the consent screen understands. */
const KNOWN_ABILITIES: readonly string[] = ['read', 'write', 'send', 'webhooks', 'admin'];

export interface AuthorizationUrlParams {
  /** Your app's name, shown on the consent screen. */
  appName: string;
  /** Where the platform sends the user back. Must match at exchange time. */
  redirectUri: string;
  /** Subset of read/write/send/webhooks/admin. Defaults to `['read']`. */
  abilities?: Ability[];
  /** Opaque CSRF token — store it, then verify it in {@link Connect.handleCallback}. */
  state?: string;
  /**
   * Your app's logo (https URL) for the consent screen. The platform
   * re-validates it and silently drops anything unsafe.
   */
  logoUrl?: string;
}

/** The query parameters the platform appends to your redirect URI. */
export interface CallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  [key: string]: unknown;
}

export interface ConnectOptions {
  /** Custom `fetch` implementation (tests, proxies). */
  fetch?: FetchLike;
  /** Request timeout in milliseconds. Default 30_000. */
  timeout?: number;
  /** Appended to the SDK's User-Agent. */
  userAgent?: string;
}

/**
 * The OAuth-style "connect with one click" flow — how you obtain a token for a
 * user's workspace without anyone copy-pasting API keys.
 *
 * ```ts
 * const connect = new Connect('https://connect.getokta.io');
 * const state = Connect.generateState();          // stash in the session
 *
 * // 1. Send the user to the consent screen.
 * const url = connect.authorizationUrl({
 *   appName: 'My CRM',
 *   redirectUri: 'https://crm.example.com/okta/callback',
 *   abilities: ['read', 'send'],
 *   state,
 * });
 *
 * // 2. On the callback, verify state + exchange the code in one call.
 * const token = await connect.handleCallback(req.query, redirectUri, state);
 *
 * // 3. Build a client and go.
 * const client = new OktaConnect({ baseUrl, token: token.access_token });
 * ```
 *
 * There is no `client_secret` and no PKCE: the authorization code is one-time,
 * expires in five minutes, and is bound to your `redirect_uri`, so an
 * intercepted redirect cannot be redeemed elsewhere. Keep `state` opaque and
 * unguessable, and always verify it on return.
 */
export class Connect {
  private readonly baseUrl: string;
  private readonly http: HttpClient;

  constructor(baseUrl: string, options: ConnectOptions = {}) {
    this.baseUrl = normaliseBaseUrl(baseUrl);

    // The token-exchange endpoint is unauthenticated — it *mints* the token —
    // so a placeholder credential is correct here.
    const clientOptions: ClientOptions = {
      baseUrl: this.baseUrl,
      token: 'none',
      maxRetries: 0,
      ...options,
    };

    this.http = new HttpClient(resolveConfig(clientOptions));
  }

  /**
   * Generate an opaque, unguessable `state` for CSRF protection. Store it
   * before redirecting and hand it back to {@link handleCallback}.
   */
  static generateState(bytes = 24): string {
    return randomBytes(Math.max(16, bytes)).toString('hex');
  }

  /** Build the consent-screen URL to send the user to. */
  authorizationUrl(params: AuthorizationUrlParams): string {
    const abilities = (params.abilities ?? ['read']).filter((ability) =>
      KNOWN_ABILITIES.includes(ability),
    );

    const query = new URLSearchParams({
      app_name: params.appName,
      redirect_uri: params.redirectUri,
      abilities: (abilities.length > 0 ? abilities : ['read']).join(','),
    });

    if (params.state) query.set('state', params.state);
    if (params.logoUrl) query.set('logo', params.logoUrl);

    return `${this.baseUrl}/connect?${query.toString()}`;
  }

  /**
   * Validate the redirect query and exchange the code for a token.
   *
   * Prefer this over calling {@link exchange} directly — it runs the security
   * checks (denied consent, `state` mismatch, missing code) that the raw
   * exchange cannot.
   *
   * @throws {OktaConnectError} when consent was denied, `state` doesn't match,
   *         or the callback carried no code.
   */
  async handleCallback(
    query: CallbackQuery,
    redirectUri: string,
    expectedState?: string,
  ): Promise<AccessToken> {
    if (query.error) {
      throw new OktaConnectError(`Authorization was not granted: ${query.error}`, {
        status: 400,
      });
    }

    if (expectedState !== undefined) {
      if (!safeEqual(expectedState, typeof query.state === 'string' ? query.state : '')) {
        throw new OktaConnectError(
          'OAuth state mismatch — possible CSRF; discarding the callback.',
          { status: 400 },
        );
      }
    }

    const code = typeof query.code === 'string' ? query.code : '';

    if (code === '') {
      throw new OktaConnectError('The authorization callback carried no code.', { status: 400 });
    }

    return this.exchange(code, redirectUri);
  }

  /**
   * Exchange a one-time authorization code for an access token. Pass the
   * **same** `redirect_uri` you authorized with — the platform binds the code
   * to it.
   */
  async exchange(code: string, redirectUri: string): Promise<AccessToken> {
    if (!code) {
      throw new InvalidArgumentError('An authorization code is required.');
    }

    const response = await this.http.post<{ data?: AccessToken } & Partial<AccessToken>>(
      '/api/v1/oauth/token',
      { code, redirect_uri: redirectUri },
    );

    const payload = response.data;
    const token = (payload?.data ?? payload) as AccessToken | undefined;

    if (!token?.access_token) {
      throw new OktaConnectError('The token exchange returned no access_token.', {
        status: response.status,
        json: payload,
      });
    }

    // Normalise the fields callers read unconditionally, so a lean response
    // (no abilities echoed, no expiry) still yields a fully-shaped token.
    return {
      ...token,
      token_type: token.token_type ?? 'Bearer',
      abilities: token.abilities ?? [],
      expires_at: token.expires_at ?? null,
    };
  }
}

/** Constant-time string comparison — never leak a match position by timing. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  // timingSafeEqual throws on unequal lengths, so compare against a fixed-size
  // digest-free padding: a length mismatch is already a definitive mismatch.
  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);
}

/** True when `abilities` contains everything in `wanted`. */
export function hasAbilities(abilities: readonly string[], wanted: readonly string[]): boolean {
  return wanted.every((ability) => abilities.includes(ability));
}

/** The abilities in `wanted` that `abilities` does **not** cover. */
export function missingAbilities(
  abilities: readonly string[],
  wanted: readonly string[],
): string[] {
  return wanted.filter((ability) => !abilities.includes(ability));
}
