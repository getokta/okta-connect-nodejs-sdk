import { InvalidArgumentError } from './http/errors.js';

/** The `fetch` signature the SDK depends on — inject any compatible implementation. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Called before each attempt, including retries. Useful for logging/metrics. */
export type RetryListener = (info: {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  method: string;
  url: string;
  status?: number;
  error?: unknown;
}) => void;

export interface ClientOptions {
  /**
   * Root URL of the Okta Connect deployment, e.g. `https://connect.getokta.io`.
   * Falls back to `process.env.OKTA_CONNECT_BASE_URL`.
   */
  baseUrl?: string;

  /**
   * Sanctum personal-access token. Its abilities decide which endpoints
   * succeed. Falls back to `process.env.OKTA_CONNECT_TOKEN`.
   */
  token?: string;

  /** Per-request timeout in milliseconds. Default 30_000. */
  timeout?: number;

  /**
   * Retry budget for retryable failures (429, 5xx, network). Default 2, i.e.
   * up to 3 attempts total. Set 0 to disable retries.
   */
  maxRetries?: number;

  /** Base backoff in milliseconds; doubles per attempt. Default 250. */
  retryBaseDelay?: number;

  /** Upper bound on a single backoff sleep, in milliseconds. Default 8_000. */
  retryMaxDelay?: number;

  /** Extra headers sent on every request. */
  headers?: Record<string, string>;

  /** Custom `fetch` implementation (tests, proxies, alternative transports). */
  fetch?: FetchLike;

  /** Appended to the SDK's own User-Agent, e.g. `"my-crm/2.1"`. */
  userAgent?: string;

  /** Invoked before each retry — handy for observability. */
  onRetry?: RetryListener;
}

/** Fully-resolved, immutable configuration. */
export interface ResolvedConfig {
  baseUrl: string;
  token: string;
  timeout: number;
  maxRetries: number;
  retryBaseDelay: number;
  retryMaxDelay: number;
  headers: Record<string, string>;
  fetch: FetchLike;
  userAgent: string;
  onRetry?: RetryListener;
}

/**
 * The SDK version, stamped into the User-Agent.
 *
 * Kept as a literal rather than imported from package.json, so the bundle
 * doesn't depend on package.json being resolvable at runtime (it isn't, under
 * some bundlers). It MUST match package.json's version — a test asserts this,
 * because a drifted value silently mislabels every request in our logs.
 */
export const VERSION = '2.0.0';

function readEnv(key: string): string | undefined {
  // Guarded so the SDK also loads in environments without `process` (edge
  // runtimes, browsers via a bundler) — there, options must be explicit.
  const env = typeof process !== 'undefined' ? process.env : undefined;
  const value = env?.[key];

  return value !== undefined && value !== '' ? value : undefined;
}

/**
 * Validate and normalise user-supplied options, filling in env fallbacks and
 * defaults. Throws early (before any request) on a missing base URL or token.
 */
export function resolveConfig(options: ClientOptions = {}): ResolvedConfig {
  const baseUrl = options.baseUrl ?? readEnv('OKTA_CONNECT_BASE_URL');
  const token = options.token ?? readEnv('OKTA_CONNECT_TOKEN');

  if (!baseUrl) {
    throw new InvalidArgumentError(
      'A baseUrl is required — pass `{ baseUrl }` or set OKTA_CONNECT_BASE_URL.',
    );
  }

  if (!token) {
    throw new InvalidArgumentError(
      'A token is required — pass `{ token }` or set OKTA_CONNECT_TOKEN.',
    );
  }

  const fetchImpl = options.fetch ?? (globalThis.fetch as FetchLike | undefined);

  if (!fetchImpl) {
    throw new InvalidArgumentError(
      'No global fetch available. Use Node 18+ or pass a `fetch` implementation.',
    );
  }

  return {
    baseUrl: normaliseBaseUrl(baseUrl),
    token,
    timeout: options.timeout ?? 30_000,
    maxRetries: Math.max(0, options.maxRetries ?? 2),
    retryBaseDelay: options.retryBaseDelay ?? 250,
    retryMaxDelay: options.retryMaxDelay ?? 8_000,
    headers: options.headers ?? {},
    fetch: fetchImpl,
    userAgent: buildUserAgent(options.userAgent),
    onRetry: options.onRetry,
  };
}

/** Strip a trailing slash so paths concatenate cleanly. */
export function normaliseBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();

  if (!/^https?:\/\//i.test(trimmed)) {
    throw new InvalidArgumentError(
      `baseUrl must be an absolute http(s) URL, got "${baseUrl}".`,
    );
  }

  return trimmed.replace(/\/+$/, '');
}

function buildUserAgent(suffix?: string): string {
  const runtime =
    typeof process !== 'undefined' && process.versions?.node
      ? ` node/${process.versions.node}`
      : '';

  return `okta-connect-sdk-node/${VERSION}${runtime}${suffix ? ` ${suffix}` : ''}`;
}
