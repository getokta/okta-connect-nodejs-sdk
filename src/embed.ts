import { createHmac, randomBytes } from 'node:crypto';
import { normaliseBaseUrl } from './config.js';
import { InvalidArgumentError } from './http/errors.js';

/**
 * Canonical `ui_hide` keys the embedded inbox honours.
 *
 * The platform silently ignores keys it doesn't recognise, so a typo used to
 * fail *open* — the control stayed visible and nobody noticed until a customer
 * complained. Minting through these constants turns that into a loud throw at
 * mint time.
 */
export const UiHide = {
  /** AI suggestions, AI reply buttons, sentiment, smart suggestions. */
  AI: 'ai',
  /** Close / reopen pill in the conversation header. */
  CLOSE_CONVERSATION: 'close_conversation',
  /** Agent + auto-assign dropdown. */
  ASSIGN_AGENT: 'assign_agent',
  /** Contact-details right rail (name, phone, tags, AI summary, notes). */
  SIDEBAR: 'sidebar',
  /** Channel switcher in the conversation header. */
  CHANGE_CHANNEL: 'change_channel',
  /** Snooze control. */
  SNOOZE: 'snooze',
  /** "Sync history" action. */
  SYNC_HISTORY: 'sync_history',
  /** Knowledge-base panel / button. */
  KNOWLEDGE_BASE: 'knowledge_base',
  /** AI smart-summary block. */
  SMART_SUMMARY: 'smart_summary',
  /** Render the sidebar collapsed by default, without hiding it. */
  SIDEBAR_DEFAULT_CLOSED: 'sidebar_default_closed',
} as const;

export type UiHideKey = (typeof UiHide)[keyof typeof UiHide];

const UI_HIDE_KEYS: readonly string[] = Object.values(UiHide);

/** Normalise + validate `ui_hide` keys: drop blanks, de-duplicate, reject unknowns. */
export function validateUiHide(keys: readonly string[]): string[] {
  const clean: string[] = [];

  for (const key of keys) {
    if (key === '') continue;

    if (!UI_HIDE_KEYS.includes(key)) {
      throw new InvalidArgumentError(
        `Unknown ui_hide key "${key}". Allowed keys: ${UI_HIDE_KEYS.join(', ')}.`,
      );
    }

    if (!clean.includes(key)) clean.push(key);
  }

  return clean;
}

/**
 * Embed scopes: which surfaces the minted token may reach.
 *
 * Only the inbox scope is mintable from this SDK. The platform-operator
 * scope was removed: it is not a grant any consumer of a public package
 * is entitled to, and defaulting to it handed every integration more
 * reach than it needed.
 */
export const EmbedScope = {
  /** `/embed/inbox/*` only. */
  INBOX: 'platform.inbox',
} as const;

export type EmbedScopeValue = (typeof EmbedScope)[keyof typeof EmbedScope];

/**
 * The operator an embed token is minted for.
 *
 * `sub` is your own stable identifier for the user; `email` is what the
 * platform keys its User row off (find-or-create); `name` is optional display
 * text. Bundling the three prevents transposing `email` and `name` — a
 * recurring source of "logged in as the wrong account" bugs.
 */
export interface EmbedUser {
  sub: string;
  email: string;
  name?: string;
}

export interface EmbedMintOptions {
  /** Defaults to `platform.inbox`, the only scope this SDK mints. */
  scope?: EmbedScopeValue;
  /** Feature keys to strip from the inbox chrome. */
  uiHide?: string[];
  /** Token lifetime in seconds. */
  ttlSeconds?: number;
}

export interface EmbedOptions {
  /** JWT `iss`. Override only for a per-partner provisioned secret. */
  issuer?: string;
  /** JWT `aud`. Override only for a non-default platform deployment. */
  audience?: string;
}

/** Server-side ceiling on the one-shot SSO token's lifetime (5 minutes). */
const SSO_MAX_TTL = 300;

/** Server-side ceiling on the long-lived cookieless token's lifetime (4 hours). */
const SESSION_MAX_TTL = 14_400;

const DEFAULT_REDIRECT = '/app/inbox?embedded=1';

/**
 * Everything needed to embed the Okta Connect inbox in an iframe. Pure crypto
 * and URL assembly — no HTTP.
 *
 * Construct it with the shared secret your platform operator provisioned, or
 * get one pre-wired to the client's base URL via `client.embed(secret)`.
 *
 * Two flows, picked by how the iframe re-proves identity:
 *
 * 1. **SSO landing handshake** — {@link ssoUrl} mints a one-shot token (≤5 min,
 *    replay-checked). The platform verifies it, starts a normal session, and
 *    bounces to `redirect`. Fine same-site; fragile where third-party cookies
 *    are blocked.
 * 2. **Cookieless per-request** — {@link inboxUrl} / {@link embedUrl} mint a
 *    long-lived token (≤4 h) that rides every request, so no cookie is needed.
 *    This is what survives Safari ITP and Chrome's third-party-cookie
 *    phase-out; prefer it for white-label embeds.
 *
 * Both validate `ui_hide` and the TTL at mint time, so a misconfigured embed
 * fails loudly here rather than silently in the browser.
 */
export class Embed {
  private readonly baseUrl: string;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(
    baseUrl: string,
    private readonly sharedSecret: string,
    options: EmbedOptions = {},
  ) {
    if (!sharedSecret) {
      throw new InvalidArgumentError('The embed shared secret must not be empty.');
    }

    this.baseUrl = normaliseBaseUrl(baseUrl);
    this.issuer = options.issuer ?? 'okta-web';
    this.audience = options.audience ?? 'okta-whatsapp';
  }

  // -------------------------------------------------------------------------
  // Flow 1 — one-shot SSO landing handshake (≤5 min)
  // -------------------------------------------------------------------------

  /** Mint a one-shot SSO token for the `/embed/sso` landing route. */
  ssoToken(user: EmbedUser, options: EmbedMintOptions = {}): string {
    const ttl = options.ttlSeconds ?? 60;
    assertTtl(ttl, SSO_MAX_TTL);

    return this.encode(user, options.scope ?? EmbedScope.INBOX, options.uiHide ?? [], ttl);
  }

  /**
   * Mint + assemble the full `/embed/sso?token=…&redirect=…` URL, ready for an
   * `<iframe src>` or a `Location` header.
   */
  ssoUrl(
    user: EmbedUser,
    redirectPath: string = DEFAULT_REDIRECT,
    options: EmbedMintOptions = {},
  ): string {
    const token = this.ssoToken(user, options);

    return `${this.baseUrl}/embed/sso?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(redirectPath)}`;
  }

  // -------------------------------------------------------------------------
  // Flow 2 — cookieless per-request token (≤4 h)
  // -------------------------------------------------------------------------

  /**
   * Mint a long-lived token for cookieless per-request auth. The same token
   * rides every request inside the iframe; the platform does not replay-check it.
   */
  sessionToken(user: EmbedUser, options: EmbedMintOptions = {}): string {
    const ttl = options.ttlSeconds ?? SESSION_MAX_TTL;
    assertTtl(ttl, SESSION_MAX_TTL);

    return this.encode(user, options.scope ?? EmbedScope.INBOX, options.uiHide ?? [], ttl);
  }

  /**
   * Build an iframe URL for `path` with a freshly-minted session token appended
   * as `?embed_token=`. Query parameters already on `path` are preserved.
   */
  embedUrl(path: string, user: EmbedUser, options: EmbedMintOptions = {}): string {
    const token = this.sessionToken(user, options);
    const url = `${this.baseUrl}/${path.replace(/^\/+/, '')}`;
    const separator = url.includes('?') ? '&' : '?';

    return `${url}${separator}embed_token=${encodeURIComponent(token)}`;
  }

  /**
   * The embedded inbox with a cookieless session token — scoped to
   * `platform.inbox` unless you say otherwise.
   *
   * ```ts
   * const src = client.embed(secret).inboxUrl(
   *   { sub: 'partner-user-7', email: 'op@acme.com', name: 'Op' },
   *   { uiHide: [UiHide.AI, UiHide.ASSIGN_AGENT] },
   * );
   * ```
   */
  inboxUrl(user: EmbedUser, options: EmbedMintOptions = {}): string {
    return this.embedUrl(DEFAULT_REDIRECT, user, {
      scope: EmbedScope.INBOX,
      ...options,
    });
  }

  /**
   * The header to attach to your own XHR/fetch calls instead of putting the
   * token in the URL — handy when you'd rather not leak a JWT into browser
   * history or referrer logs.
   */
  tokenHeader(sessionToken: string): { 'X-Embed-Token': string } {
    return { 'X-Embed-Token': sessionToken };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private encode(
    user: EmbedUser,
    scope: string,
    uiHide: string[],
    ttlSeconds: number,
  ): string {
    if (!user?.sub || !user?.email) {
      throw new InvalidArgumentError('An embed user requires a non-empty sub and email.');
    }

    if (scope !== EmbedScope.INBOX) {
      throw new InvalidArgumentError(
        `Unknown scope "${scope}". Use EmbedScope.INBOX.`,
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const payload: Record<string, unknown> = {
      iss: this.issuer,
      aud: this.audience,
      sub: user.sub,
      email: user.email,
      name: user.name ?? '',
      scope,
      jti: randomBytes(16).toString('hex'),
      iat: now,
      exp: now + ttlSeconds,
    };

    const cleanUiHide = validateUiHide(uiHide);

    if (cleanUiHide.length > 0) payload.ui_hide = cleanUiHide;

    const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64Url(JSON.stringify(payload));
    const signature = createHmac('sha256', this.sharedSecret)
      .update(`${header}.${body}`)
      .digest();

    return `${header}.${body}.${base64Url(signature)}`;
  }
}

function assertTtl(ttlSeconds: number, max: number): void {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > max) {
    throw new InvalidArgumentError(`ttlSeconds must be an integer between 1 and ${max}.`);
  }
}

function base64Url(input: string | Buffer): string {
  const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;

  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
