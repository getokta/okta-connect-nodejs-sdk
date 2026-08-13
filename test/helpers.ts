import { OktaConnect, type OktaConnectError } from '../src/index.js';
import type { ClientOptions, FetchLike } from '../src/config.js';

/**
 * Await a call that is expected to reject and hand back the typed error.
 * Fails loudly when the call resolves instead — a silently-passing negative
 * test is worse than no test.
 */
export async function captureError<T = OktaConnectError>(promise: Promise<unknown>): Promise<T> {
  const resolvedMarker = Symbol('resolved');
  const outcome = await promise.then(
    () => resolvedMarker,
    (error: unknown) => error,
  );

  if (outcome === resolvedMarker) {
    throw new Error('Expected the call to reject, but it resolved.');
  }

  return outcome as T;
}

export interface RecordedRequest {
  method: string;
  url: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: unknown;
  rawBody?: string;
}

export interface StubResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Throw instead of responding — simulates a transport failure. */
  throws?: Error;
}

export interface FetchStub {
  fetch: FetchLike;
  requests: RecordedRequest[];
  /** The single request made, asserting exactly one happened. */
  last(): RecordedRequest;
  callCount(): number;
}

/**
 * Build a `fetch` stub that replays `responses` in order. The final entry is
 * reused once exhausted, so a test that retries doesn't need to repeat itself.
 */
export function stubFetch(responses: StubResponse | StubResponse[]): FetchStub {
  const queue = Array.isArray(responses) ? responses : [responses];
  const requests: RecordedRequest[] = [];
  let index = 0;

  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    const rawBody = typeof init?.body === 'string' ? init.body : undefined;

    requests.push({
      method: init?.method ?? 'GET',
      url: input,
      path: url.pathname,
      query: url.searchParams,
      headers: normaliseHeaders(init?.headers),
      body: rawBody ? safeParse(rawBody) : undefined,
      rawBody,
    });

    const stub = queue[Math.min(index, queue.length - 1)] ?? {};
    index++;

    if (stub.throws) throw stub.throws;

    const body = stub.body === undefined ? '' : JSON.stringify(stub.body);

    return new Response(body, {
      status: stub.status ?? 200,
      headers: { 'content-type': 'application/json', ...(stub.headers ?? {}) },
    });
  };

  return {
    fetch,
    requests,
    last() {
      const request = requests.at(-1);

      if (!request) throw new Error('No request was made.');

      return request;
    },
    callCount: () => requests.length,
  };
}

/** A client wired to a fetch stub, with retries off unless a test asks for them. */
export function testClient(
  responses: StubResponse | StubResponse[],
  options: Partial<ClientOptions> = {},
): { client: OktaConnect; stub: FetchStub } {
  const stub = stubFetch(responses);
  const client = new OktaConnect({
    baseUrl: 'https://connect.test',
    token: 'test-token',
    maxRetries: 0,
    fetch: stub.fetch,
    ...options,
  });

  return { client, stub };
}

/** A Laravel-style paginator envelope. */
export function paginated<T>(
  data: T[],
  meta: Record<string, unknown> = {},
  links: Record<string, unknown> = {},
) {
  return {
    data,
    links: { first: null, last: null, prev: null, next: null, ...links },
    meta: { current_page: 1, per_page: 25, total: data.length, last_page: 1, ...meta },
  };
}

/** Flatten any of the shapes `RequestInit.headers` accepts into a lower-cased map. */
function normaliseHeaders(headers: RequestInit['headers']): Record<string, string> {
  if (!headers) return {};

  const out: Record<string, string> = {};

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key.toLowerCase()] = value;
    });

    return out;
  }

  if (Array.isArray(headers)) {
    for (const entry of headers) {
      const [key, value] = entry as [string, string];
      out[String(key).toLowerCase()] = String(value);
    }

    return out;
  }

  for (const [key, value] of Object.entries(headers)) {
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }

  return out;
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
