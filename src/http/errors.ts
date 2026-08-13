/**
 * Typed error hierarchy.
 *
 * Every non-2xx response raises an {@link OktaConnectError} subclass, so a
 * caller can branch on the failure mode without re-reading status codes:
 *
 * ```ts
 * try {
 *   await client.messages.sendText(channelId, waId, 'Hello');
 * } catch (error) {
 *   if (error instanceof RateLimitError) await sleep(error.retryAfter ?? 1);
 *   else if (error instanceof ValidationError) console.error(error.errors);
 *   else throw error;
 * }
 * ```
 */

/** The per-field validation map Laravel returns under the `errors` key. */
export type ValidationErrorMap = Record<string, string[]>;

export interface OktaConnectErrorOptions {
  /** HTTP status code, or 0 for transport-level failures. */
  status?: number;
  /** Raw (undecoded) response body, when there was a response. */
  body?: string;
  /** Decoded JSON body, when the response carried valid JSON. */
  json?: unknown;
  /** Response headers, lower-cased keys. */
  headers?: Record<string, string>;
  /** HTTP method of the failing request. */
  method?: string;
  /** Absolute URL of the failing request. */
  url?: string;
  /** Number of attempts made before giving up (1 = no retries). */
  attempts?: number;
  cause?: unknown;
}

/** Base class for every error this SDK raises. */
export class OktaConnectError extends Error {
  readonly status: number;
  readonly body?: string;
  readonly json?: unknown;
  readonly headers: Record<string, string>;
  readonly method?: string;
  readonly url?: string;
  readonly attempts: number;

  constructor(message: string, options: OktaConnectErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.status = options.status ?? 0;
    this.body = options.body;
    this.json = options.json;
    this.headers = options.headers ?? {};
    this.method = options.method;
    this.url = options.url;
    this.attempts = options.attempts ?? 1;

    // Restore the prototype chain for consumers compiling down to ES5, where
    // `instanceof` would otherwise fail against a subclassed built-in.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * The platform's `request_id`/`X-Request-Id`, when present — quote it when
   * reporting a problem to support.
   */
  get requestId(): string | undefined {
    return this.headers['x-request-id'];
  }
}

/** 401 — token missing, invalid, expired, or revoked. */
export class AuthenticationError extends OktaConnectError {}

/** 403 — the token lacks the ability this endpoint requires. */
export class AuthorizationError extends OktaConnectError {}

/** 404 — the resource does not exist, or is not visible to this token. */
export class NotFoundError extends OktaConnectError {}

/** 409 — the request conflicts with the current state of the resource. */
export class ConflictError extends OktaConnectError {}

/** 422 — the request body failed validation. */
export class ValidationError extends OktaConnectError {
  /** Field name → list of messages, exactly as the API returns it. */
  readonly errors: ValidationErrorMap;

  constructor(
    message: string,
    options: OktaConnectErrorOptions & { errors?: ValidationErrorMap } = {},
  ) {
    super(message, options);
    this.errors = options.errors ?? {};
  }

  /** The first message recorded for `field`, if any. */
  first(field: string): string | undefined {
    return this.errors[field]?.[0];
  }

  /** The fields that failed validation. */
  get fields(): string[] {
    return Object.keys(this.errors);
  }
}

/** 429 — the token exceeded its rate limit. */
export class RateLimitError extends OktaConnectError {
  /** Seconds to wait before retrying, parsed from the `Retry-After` header. */
  readonly retryAfter?: number;

  constructor(message: string, options: OktaConnectErrorOptions & { retryAfter?: number } = {}) {
    super(message, options);
    this.retryAfter = options.retryAfter;
  }
}

/** 5xx — the server failed. Raised after the retry budget is exhausted. */
export class ServerError extends OktaConnectError {}

/** The request never got a response: DNS, TLS, socket, or a dropped connection. */
export class ConnectionError extends OktaConnectError {}

/** The request exceeded the configured timeout, or its `AbortSignal` fired. */
export class TimeoutError extends ConnectionError {}

/** Bad SDK usage — an invalid argument, caught before any request is made. */
export class InvalidArgumentError extends OktaConnectError {}

/** Signature verification failed on an inbound webhook delivery. */
export class WebhookSignatureError extends OktaConnectError {}

/**
 * Map an HTTP status onto the matching error class. Anything unrecognised
 * falls back to the base {@link OktaConnectError}.
 */
export function errorFromStatus(
  status: number,
  message: string,
  options: OktaConnectErrorOptions & { errors?: ValidationErrorMap; retryAfter?: number },
): OktaConnectError {
  switch (status) {
    case 401:
      return new AuthenticationError(message, options);
    case 403:
      return new AuthorizationError(message, options);
    case 404:
      return new NotFoundError(message, options);
    case 409:
      return new ConflictError(message, options);
    case 422:
      return new ValidationError(message, options);
    case 429:
      return new RateLimitError(message, options);
    default:
      return status >= 500
        ? new ServerError(message, options)
        : new OktaConnectError(message, options);
  }
}
