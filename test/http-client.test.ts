import { describe, expect, it, vi } from 'vitest';
import {
  AuthenticationError,
  AuthorizationError,
  ConnectionError,
  NotFoundError,
  OktaConnectError,
  RateLimitError,
  ServerError,
  TimeoutError,
  ValidationError,
} from '../src/index.js';
import { captureError, stubFetch, testClient } from './helpers.js';

describe('transport', () => {
  it('sends bearer auth, JSON headers and a versioned User-Agent', async () => {
    const { client, stub } = testClient({ body: { data: { id: '01H' } } });

    await client.contacts.get('01H');

    const request = stub.last();
    expect(request.headers.authorization).toBe('Bearer test-token');
    expect(request.headers.accept).toBe('application/json');
    expect(request.headers['user-agent']).toMatch(/^okta-connect-sdk-node\/\d+\.\d+\.\d+/);
    expect(request.url).toBe('https://connect.test/api/v1/contacts/01H');
  });

  it('trims a trailing slash off the base URL', async () => {
    const { client, stub } = testClient(
      { body: { data: {} } },
      { baseUrl: 'https://connect.test/' },
    );

    await client.contacts.get('01H');

    expect(stub.last().url).toBe('https://connect.test/api/v1/contacts/01H');
  });

  it('serialises query params, skipping null and undefined', async () => {
    const { client, stub } = testClient({ body: { data: [] } });

    await client.contacts.list({ search: 'ali', per_page: 50, page: undefined });

    const { query } = stub.last();
    expect(query.get('search')).toBe('ali');
    expect(query.get('per_page')).toBe('50');
    expect(query.has('page')).toBe(false);
  });

  it('percent-encodes path segments', async () => {
    const { client, stub } = testClient({ body: { data: {} } });

    await client.contacts.get('a/b?c');

    expect(stub.last().path).toBe('/api/v1/contacts/a%2Fb%3Fc');
  });

  it('sends an Idempotency-Key when one is supplied', async () => {
    const { client, stub } = testClient({ body: { data: {} } });

    await client.messages.sendText('01HCH', '966500000000', 'Hi', {
      idempotencyKey: 'order-1042',
    });

    expect(stub.last().headers['idempotency-key']).toBe('order-1042');
  });

  it('omits the Idempotency-Key header by default', async () => {
    const { client, stub } = testClient({ body: { data: {} } });

    await client.messages.sendText('01HCH', '966500000000', 'Hi');

    expect(stub.last().headers['idempotency-key']).toBeUndefined();
  });
});

describe('error mapping', () => {
  const cases = [
    [401, AuthenticationError],
    [403, AuthorizationError],
    [404, NotFoundError],
    [422, ValidationError],
    [429, RateLimitError],
    [500, ServerError],
    [418, OktaConnectError],
  ] as const;

  for (const [status, expected] of cases) {
    it(`maps HTTP ${status} to ${expected.name}`, async () => {
      const { client } = testClient({ status, body: { message: 'nope' } });

      await expect(client.contacts.get('01H')).rejects.toBeInstanceOf(expected);
    });
  }

  it('surfaces the API message, status and body on the error', async () => {
    const { client } = testClient({ status: 404, body: { message: 'Channel not found.' } });

    const error = await captureError<OktaConnectError>(client.channels.get('01H'));

    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.message).toBe('Channel not found.');
    expect(error.status).toBe(404);
    expect(error.method).toBe('GET');
    expect(error.url).toContain('/api/v1/channels/01H');
  });

  it('exposes the field map on a 422', async () => {
    const { client } = testClient({
      status: 422,
      body: {
        message: 'The wa id field is required.',
        errors: { wa_id: ['The wa id field is required.'] },
      },
    });

    const error = await captureError<ValidationError>(client.contacts
      .upsert({ wa_id: '' }));

    expect(error).toBeInstanceOf(ValidationError);
    expect(error.fields).toEqual(['wa_id']);
    expect(error.first('wa_id')).toBe('The wa id field is required.');
  });

  it('parses Retry-After onto a 429', async () => {
    const { client } = testClient({
      status: 429,
      body: { message: 'Too Many Requests' },
      headers: { 'retry-after': '30' },
    });

    const error = await captureError<RateLimitError>(client.contacts.get('01H'));

    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.retryAfter).toBe(30);
  });

  it('falls back to a synthetic message when the body carries none', async () => {
    const { client } = testClient({ status: 500, body: {} });

    const error = await captureError<OktaConnectError>(client.contacts.get('01H'));

    expect(error.message).toContain('HTTP 500');
  });

  it('wraps a transport failure in ConnectionError', async () => {
    const { client } = testClient({ throws: new TypeError('fetch failed') });

    const error = await captureError<OktaConnectError>(client.contacts.get('01H'));

    expect(error).toBeInstanceOf(ConnectionError);
    expect(error.message).toContain('Could not reach');
  });

  it('reports the request id when the response carries one', async () => {
    const { client } = testClient({
      status: 500,
      body: { message: 'boom' },
      headers: { 'x-request-id': 'req_123' },
    });

    const error = await captureError<OktaConnectError>(client.contacts.get('01H'));

    expect(error.requestId).toBe('req_123');
  });
});

describe('retries', () => {
  it('retries a 429 and returns the eventual success', async () => {
    const stub = stubFetch([
      { status: 429, body: { message: 'slow down' } },
      { status: 200, body: { data: { id: '01H' } } },
    ]);
    const { client } = testClient([], { fetch: stub.fetch, maxRetries: 2, retryBaseDelay: 1 });

    const contact = await client.contacts.get('01H');

    expect(contact.id).toBe('01H');
    expect(stub.callCount()).toBe(2);
  });

  it('retries a 429 even on a bare POST — the write never landed', async () => {
    const stub = stubFetch([
      { status: 429, body: { message: 'slow down' } },
      { status: 200, body: { data: { id: '01HMSG' } } },
    ]);
    const { client } = testClient([], { fetch: stub.fetch, maxRetries: 2, retryBaseDelay: 1 });

    await client.messages.sendText('01HCH', '966500000000', 'Hi');

    expect(stub.callCount()).toBe(2);
  });

  it('retries a 5xx on GET (idempotent)', async () => {
    const stub = stubFetch([
      { status: 503, body: { message: 'unavailable' } },
      { status: 200, body: { data: { id: '01H' } } },
    ]);
    const { client } = testClient([], { fetch: stub.fetch, maxRetries: 2, retryBaseDelay: 1 });

    await client.contacts.get('01H');

    expect(stub.callCount()).toBe(2);
  });

  it('does NOT retry a 5xx on a bare POST — the send may already have happened', async () => {
    const stub = stubFetch({ status: 500, body: { message: 'boom' } });
    const { client } = testClient([], { fetch: stub.fetch, maxRetries: 3, retryBaseDelay: 1 });

    await expect(client.messages.sendText('01HCH', '966500000000', 'Hi')).rejects.toBeInstanceOf(
      ServerError,
    );
    expect(stub.callCount()).toBe(1);
  });

  it('DOES retry a 5xx on a POST carrying an idempotency key', async () => {
    const stub = stubFetch([
      { status: 500, body: { message: 'boom' } },
      { status: 200, body: { data: { id: '01HMSG' } } },
    ]);
    const { client } = testClient([], { fetch: stub.fetch, maxRetries: 2, retryBaseDelay: 1 });

    await client.messages.sendText('01HCH', '966500000000', 'Hi', {
      idempotencyKey: 'order-1042',
    });

    expect(stub.callCount()).toBe(2);
  });

  it('does not retry a network failure on a bare POST', async () => {
    const stub = stubFetch({ throws: new TypeError('socket hang up') });
    const { client } = testClient([], { fetch: stub.fetch, maxRetries: 3, retryBaseDelay: 1 });

    await expect(client.messages.sendText('01HCH', '9665', 'Hi')).rejects.toBeInstanceOf(
      ConnectionError,
    );
    expect(stub.callCount()).toBe(1);
  });

  it('gives up after the retry budget and raises the last error', async () => {
    const stub = stubFetch({ status: 503, body: { message: 'unavailable' } });
    const { client } = testClient([], { fetch: stub.fetch, maxRetries: 2, retryBaseDelay: 1 });

    const error = await captureError<OktaConnectError>(client.contacts.get('01H'));

    expect(error).toBeInstanceOf(ServerError);
    expect(stub.callCount()).toBe(3); // 1 attempt + 2 retries
    expect(error.attempts).toBe(3);
  });

  it('never retries a 4xx that is not 429', async () => {
    const stub = stubFetch({ status: 404, body: { message: 'gone' } });
    const { client } = testClient([], { fetch: stub.fetch, maxRetries: 3, retryBaseDelay: 1 });

    await expect(client.contacts.get('01H')).rejects.toBeInstanceOf(NotFoundError);
    expect(stub.callCount()).toBe(1);
  });

  it('honours Retry-After over the computed backoff', async () => {
    const stub = stubFetch([
      { status: 429, body: {}, headers: { 'retry-after': '1' } },
      { status: 200, body: { data: {} } },
    ]);
    const onRetry = vi.fn();
    const { client } = testClient([], {
      fetch: stub.fetch,
      maxRetries: 1,
      retryBaseDelay: 1,
      retryMaxDelay: 5,
      onRetry,
    });

    await client.contacts.get('01H');

    // Retry-After: 1s, clamped down to the 5ms retryMaxDelay ceiling.
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ status: 429, delayMs: 5 }));
  });

  it('reports each retry to the onRetry listener', async () => {
    const stub = stubFetch([{ status: 503, body: {} }, { status: 200, body: { data: {} } }]);
    const onRetry = vi.fn();
    const { client } = testClient([], {
      fetch: stub.fetch,
      maxRetries: 2,
      retryBaseDelay: 1,
      onRetry,
    });

    await client.contacts.get('01H');

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]?.[0]).toMatchObject({
      attempt: 1,
      maxAttempts: 3,
      method: 'GET',
      status: 503,
    });
  });
});

describe('timeouts and cancellation', () => {
  it('raises TimeoutError when the request outlives the timeout', async () => {
    const slowFetch = () => new Promise<Response>(() => {});
    const { client } = testClient([], { fetch: slowFetch, timeout: 20 });

    const error = await captureError<OktaConnectError>(client.contacts.get('01H'));

    expect(error).toBeInstanceOf(TimeoutError);
    expect(error.message).toContain('timed out after 20ms');
  });

  it('does not retry after the caller aborts', async () => {
    const controller = new AbortController();
    let calls = 0;
    const hangingFetch = (_input: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        calls++;
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });

    const { client } = testClient([], { fetch: hangingFetch, maxRetries: 3, retryBaseDelay: 1 });

    const promise = client.contacts.get('01H', { signal: controller.signal });
    controller.abort();

    const error = await captureError<OktaConnectError>(promise);

    expect(error).toBeInstanceOf(ConnectionError);
    expect(error.message).toContain('aborted by the caller');
    expect(calls).toBe(1);
  });

  it('lets a per-call timeout override the client default', async () => {
    const slowFetch = () => new Promise<Response>(() => {});
    const { client } = testClient([], { fetch: slowFetch, timeout: 60_000 });

    const error = await captureError<OktaConnectError>(client.contacts
      .get('01H', { timeout: 15 }));

    expect(error).toBeInstanceOf(TimeoutError);
    expect(error.message).toContain('15ms');
  });
});
