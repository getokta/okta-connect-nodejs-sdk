import type { ResolvedConfig } from '../config.js';
import {
  ConnectionError,
  errorFromStatus,
  OktaConnectError,
  TimeoutError,
  type ValidationErrorMap,
} from './errors.js';

/** Query-string values the SDK knows how to serialise. */
export type QueryValue = string | number | boolean | null | undefined | Array<string | number>;
export type Query = Record<string, QueryValue>;

/** Per-call options accepted by every resource method. */
export interface RequestOptions {
  /**
   * Server-side dedup key sent as `Idempotency-Key`. Retries of a mutating
   * call carrying one are safe: the platform replays the original outcome
   * instead of performing the write twice.
   */
  idempotencyKey?: string;
  /** Abort the request from the caller side. */
  signal?: AbortSignal;
  /** Override the client timeout for this call, in milliseconds. */
  timeout?: number;
  /** Extra headers merged over the client defaults. */
  headers?: Record<string, string>;
  /** Override the client retry budget for this call. */
  maxRetries?: number;
}

export interface HttpRequest extends RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: Query;
  body?: unknown;
}

/** A decoded API response plus the transport metadata worth surfacing. */
export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  data: T;
  /** Undecoded body — populated even when the payload was not JSON. */
  raw: string;
}

/** Methods safe to replay after a network failure or 5xx. */
const IDEMPOTENT_METHODS = new Set(['GET', 'PUT', 'DELETE']);

/**
 * The SDK's transport: URL assembly, auth, JSON encoding, timeouts, retries
 * with exponential backoff, and status-to-error mapping.
 *
 * Retry policy — deliberately narrower than "retry everything":
 *
 * - **429** is always retried. The request was rejected before it was
 *   processed, so replaying it cannot double-apply a write.
 * - **5xx and network failures** are retried only when the request is safe to
 *   replay: an idempotent method (GET/PUT/DELETE), or any method carrying an
 *   `Idempotency-Key` (the platform dedups those server-side).
 * - A bare `POST` that fails mid-flight is **not** retried — the server may
 *   have already sent the message/email, and a blind replay would send it
 *   twice. Pass `idempotencyKey` to make such calls retryable.
 */
export class HttpClient {
  constructor(private readonly config: ResolvedConfig) {}

  get<T>(path: string, query?: Query, options: RequestOptions = {}): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'GET', path, query, ...options });
  }

  post<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'POST', path, body, ...options });
  }

  patch<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'PATCH', path, body, ...options });
  }

  put<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'PUT', path, body, ...options });
  }

  delete<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<HttpResponse<T>> {
    return this.request<T>({ method: 'DELETE', path, body, ...options });
  }

  /** Issue a request, retrying per the policy documented on the class. */
  async request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    const url = this.buildUrl(request.path, request.query);
    const headers = this.buildHeaders(request);
    const body = request.body === undefined ? undefined : JSON.stringify(request.body);
    const maxRetries = request.maxRetries ?? this.config.maxRetries;
    const replayable = this.isReplayable(request);

    let attempt = 0;

    for (;;) {
      attempt++;

      let response: Response;

      try {
        response = await this.send(url, request, headers, body);
      } catch (error) {
        const failure = this.transportError(error, request, url, attempt);

        // A caller-triggered abort is a decision, not a fault — never retry it.
        const aborted = request.signal?.aborted === true;

        if (aborted || !replayable || attempt > maxRetries) {
          throw failure;
        }

        await this.backoff(attempt, undefined, { request, url, maxRetries, error: failure });
        continue;
      }

      const raw = await response.text();
      const responseHeaders = headersToObject(response.headers);

      if (response.ok) {
        return {
          status: response.status,
          headers: responseHeaders,
          data: parseJson(raw) as T,
          raw,
        };
      }

      const retryable =
        response.status === 429 || (response.status >= 500 && replayable);

      if (retryable && attempt <= maxRetries) {
        await this.backoff(attempt, responseHeaders['retry-after'], {
          request,
          url,
          maxRetries,
          status: response.status,
        });
        continue;
      }

      throw this.responseError(response.status, raw, responseHeaders, request, url, attempt);
    }
  }

  /** Absolute URL for `path`, with `query` appended when non-empty. */
  buildUrl(path: string, query?: Query): string {
    const url = `${this.config.baseUrl}/${path.replace(/^\/+/, '')}`;
    const search = buildQueryString(query);

    return search ? `${url}?${search}` : url;
  }

  private buildHeaders(request: HttpRequest): Record<string, string> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      authorization: `Bearer ${this.config.token}`,
      'user-agent': this.config.userAgent,
      ...lowerCaseKeys(this.config.headers),
      ...lowerCaseKeys(request.headers ?? {}),
    };

    if (request.body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    if (request.idempotencyKey) {
      headers['idempotency-key'] = request.idempotencyKey;
    }

    return headers;
  }

  private isReplayable(request: HttpRequest): boolean {
    return IDEMPOTENT_METHODS.has(request.method) || Boolean(request.idempotencyKey);
  }

  private async send(
    url: string,
    request: HttpRequest,
    headers: Record<string, string>,
    body: string | undefined,
  ): Promise<Response> {
    if (request.signal?.aborted) {
      throw new AbortSentinel();
    }

    const timeout = request.timeout ?? this.config.timeout;
    const controller = new AbortController();
    const cleanups: Array<() => void> = [];

    // The deadline is enforced here rather than delegated to the transport: a
    // custom `fetch` that ignores its AbortSignal would otherwise hang the
    // caller forever. We still abort the controller so a well-behaved
    // transport actually releases the socket.
    const guards: Array<Promise<never>> = [];

    if (timeout > 0) {
      guards.push(
        new Promise<never>((_resolve, reject) => {
          const timer = setTimeout(() => {
            controller.abort(new TimeoutSentinel());
            reject(new TimeoutSentinel());
          }, timeout);

          cleanups.push(() => clearTimeout(timer));
        }),
      );
    }

    const callerSignal = request.signal;

    if (callerSignal) {
      guards.push(
        new Promise<never>((_resolve, reject) => {
          const onAbort = () => {
            controller.abort(callerSignal.reason);
            reject(new AbortSentinel());
          };

          callerSignal.addEventListener('abort', onAbort, { once: true });
          cleanups.push(() => callerSignal.removeEventListener('abort', onAbort));
        }),
      );
    }

    const attempt = this.config.fetch(url, {
      method: request.method,
      headers,
      body,
      signal: controller.signal,
    });

    // Whichever promise loses the race may still settle later; swallow its
    // rejection so aborting never surfaces as an unhandled rejection.
    attempt.catch(() => {});

    try {
      return await Promise.race([attempt, ...guards]);
    } finally {
      for (const cleanup of cleanups) cleanup();
    }
  }

  private transportError(
    error: unknown,
    request: HttpRequest,
    url: string,
    attempt: number,
  ): OktaConnectError {
    const context = { method: request.method, url, attempts: attempt, cause: error };

    // Distinguish "the caller cancelled" from "we gave up waiting" — only the
    // latter is a timeout, and neither is ever retried.
    if (error instanceof AbortSentinel || request.signal?.aborted) {
      return new ConnectionError(`Request to ${url} was aborted by the caller.`, context);
    }

    if (error instanceof TimeoutSentinel || isAbortError(error)) {
      const timeout = request.timeout ?? this.config.timeout;

      return new TimeoutError(`Request to ${url} timed out after ${timeout}ms.`, context);
    }

    const message = error instanceof Error ? error.message : String(error);

    return new ConnectionError(`Could not reach ${url}: ${message}`, context);
  }

  private responseError(
    status: number,
    raw: string,
    headers: Record<string, string>,
    request: HttpRequest,
    url: string,
    attempt: number,
  ): OktaConnectError {
    const json = parseJson(raw);
    const payload = isRecord(json) ? json : undefined;
    const message =
      typeof payload?.message === 'string' && payload.message !== ''
        ? payload.message
        : `HTTP ${status} from ${request.method} ${url}`;

    return errorFromStatus(status, message, {
      status,
      body: raw,
      json,
      headers,
      method: request.method,
      url,
      attempts: attempt,
      errors: isRecord(payload?.errors) ? (payload.errors as ValidationErrorMap) : undefined,
      retryAfter: parseRetryAfter(headers['retry-after']),
    });
  }

  private async backoff(
    attempt: number,
    retryAfterHeader: string | undefined,
    context: {
      request: HttpRequest;
      url: string;
      maxRetries: number;
      status?: number;
      error?: unknown;
    },
  ): Promise<void> {
    const retryAfter = parseRetryAfter(retryAfterHeader);
    const delayMs =
      retryAfter !== undefined
        ? Math.min(retryAfter * 1000, this.config.retryMaxDelay)
        : this.jitteredDelay(attempt);

    this.config.onRetry?.({
      attempt,
      maxAttempts: context.maxRetries + 1,
      delayMs,
      method: context.request.method,
      url: context.url,
      status: context.status,
      error: context.error,
    });

    await sleep(delayMs);
  }

  /** Exponential backoff with full jitter, so retries don't converge. */
  private jitteredDelay(attempt: number): number {
    const ceiling = Math.min(
      this.config.retryMaxDelay,
      this.config.retryBaseDelay * 2 ** (attempt - 1),
    );

    return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
  }
}

/** Marker for "our own deadline fired". */
class TimeoutSentinel extends Error {
  constructor() {
    super('timeout');
    this.name = 'TimeoutSentinel';
  }
}

/** Marker for "the caller aborted" — never retried, never reported as a timeout. */
class AbortSentinel extends Error {
  constructor() {
    super('aborted');
    this.name = 'AbortSentinel';
  }
}

/**
 * Serialise a query object. Skips `undefined`/`null`, renders booleans as
 * `1`/`0` (what Laravel's boolean validation expects) and arrays as repeated
 * `key[]=value` pairs.
 */
export function buildQueryString(query?: Query): string {
  if (!query) return '';

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      for (const item of value) params.append(`${key}[]`, String(item));
      continue;
    }

    params.append(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  }

  return params.toString();
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });

  return out;
}

function lowerCaseKeys(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
}

function parseJson(raw: string): unknown {
  if (raw === '') return undefined;

  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** `Retry-After` is either delta-seconds or an HTTP date; both are accepted. */
export function parseRetryAfter(header: string | undefined): number | undefined {
  if (!header) return undefined;

  const seconds = Number(header);

  if (Number.isFinite(seconds)) return Math.max(0, seconds);

  const timestamp = Date.parse(header);

  if (Number.isNaN(timestamp)) return undefined;

  return Math.max(0, Math.round((timestamp - Date.now()) / 1000));
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
