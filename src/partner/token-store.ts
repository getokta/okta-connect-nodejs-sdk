import type { ResolvedConfig } from '../config.js';
import { HttpClient } from '../http/http-client.js';
import type { PartnerAccessToken } from '../types/partner.js';

/**
 * Re-exchange this long before the server-stated expiry: covers clock drift
 * between us and the platform, plus the flight time of the call the token is
 * about to authenticate.
 */
const SKEW_SECONDS = 60;

export interface PartnerKeyPair {
  clientId: string;
  clientSecret: string;
  /** Narrow the minted token relative to the key. Never widens it. */
  abilities?: string[];
}

/**
 * Keeps one live partner bearer token in front of the transport.
 *
 * Partner tokens live an hour, and the interesting part is what happens when
 * several calls need one at the same moment. `get()` shares a single in-flight
 * exchange: a provisioning burst produces one `/token` request, not twenty —
 * which matters, because that endpoint is rate-limited at 10/min and is the
 * one place a secret can be guessed at.
 *
 * A static development token skips all of it. There is nothing to exchange, so
 * `refresh()` is a no-op and a 401 is the answer rather than a trigger.
 */
export class PartnerTokenStore {
  private token?: string;

  private expiresAt?: number;

  private abilities: string[] = [];

  /** The exchange currently in flight, shared by every concurrent caller. */
  private inFlight?: Promise<string>;

  private readonly http: HttpClient;

  constructor(
    config: ResolvedConfig,
    private readonly credentials: PartnerKeyPair | { staticToken: string },
  ) {
    this.http = new HttpClient(config);

    if ('staticToken' in credentials) {
      this.token = credentials.staticToken;
    }
  }

  get exchangeable(): boolean {
    return !('staticToken' in this.credentials);
  }

  /** The abilities the platform granted the live token. */
  get granted(): string[] {
    return [...this.abilities];
  }

  /** Unix seconds the live token expires at, or undefined when it does not. */
  get expiry(): number | undefined {
    return this.expiresAt;
  }

  /** A live bearer, exchanging one first if the current one is missing or stale. */
  async get(): Promise<string> {
    if (!this.exchangeable) return this.token as string;

    if (this.token && !this.isStale()) return this.token;

    return this.exchange();
  }

  /**
   * Discard `stale` and mint a replacement — unless someone already replaced
   * it while this caller was waiting, in which case the newer token is
   * returned as-is. Without that check, N concurrent 401s would trigger N
   * exchanges and each would invalidate the last.
   */
  async refresh(stale: string): Promise<string> {
    if (!this.exchangeable) return this.token as string;

    if (this.token && this.token !== stale) return this.token;

    this.token = undefined;
    this.expiresAt = undefined;

    return this.exchange();
  }

  private isStale(): boolean {
    // No stated expiry means we cannot pre-empt one; the 401 retry covers it.
    if (this.expiresAt === undefined) return false;

    return Math.floor(Date.now() / 1000) >= this.expiresAt - SKEW_SECONDS;
  }

  private exchange(): Promise<string> {
    this.inFlight ??= this.performExchange().finally(() => {
      this.inFlight = undefined;
    });

    return this.inFlight;
  }

  private async performExchange(): Promise<string> {
    const credentials = this.credentials as PartnerKeyPair;

    const body: Record<string, unknown> = {
      grant_type: 'client_credentials',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    };

    if (credentials.abilities) body.abilities = credentials.abilities;

    const response = await this.http.post<PartnerAccessToken>(
      '/api/v1/partner/token',
      body,
      // The key pair in the body IS the credential here; an empty value tells
      // the transport to send no Authorization header at all.
      { headers: { authorization: '' } },
    );

    const payload = response.data;

    this.token = payload.access_token;
    this.abilities = payload.abilities ?? [];
    this.expiresAt = expiryOf(payload);

    return this.token;
  }
}

/**
 * Prefer the server's absolute `expires_at` over `expires_in`: the former
 * survives a slow response, the latter starts counting from whenever we
 * happened to parse it.
 */
function expiryOf(payload: PartnerAccessToken): number | undefined {
  if (payload.expires_at) {
    const parsed = Date.parse(payload.expires_at);

    if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  }

  // The platform sends 0 for a token with no deadline — not one that expired
  // a moment ago.
  if (typeof payload.expires_in === 'number' && payload.expires_in > 0) {
    return Math.floor(Date.now() / 1000) + payload.expires_in;
  }

  return undefined;
}
