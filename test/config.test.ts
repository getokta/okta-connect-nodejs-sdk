import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { InvalidArgumentError, OktaConnect, resolveConfig, VERSION } from '../src/index.js';

const ENV_KEYS = ['OKTA_CONNECT_BASE_URL', 'OKTA_CONNECT_TOKEN'] as const;
const saved = new Map<string, string | undefined>();

for (const key of ENV_KEYS) saved.set(key, process.env[key]);

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved.get(key);

    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('VERSION', () => {
  it('matches package.json, so the User-Agent never mislabels a request', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };

    expect(VERSION).toBe(pkg.version);
  });
});

describe('resolveConfig', () => {
  it('applies the documented defaults', () => {
    const config = resolveConfig({ baseUrl: 'https://connect.test', token: 'tok' });

    expect(config.timeout).toBe(30_000);
    expect(config.maxRetries).toBe(2);
    expect(config.retryBaseDelay).toBe(250);
    expect(config.retryMaxDelay).toBe(8_000);
    expect(config.userAgent).toMatch(/^okta-connect-sdk-node\/\d+\.\d+\.\d+ node\//);
  });

  it('reads the base URL and token from the environment', () => {
    process.env.OKTA_CONNECT_BASE_URL = 'https://env.test';
    process.env.OKTA_CONNECT_TOKEN = 'env-token';

    const config = resolveConfig();

    expect(config.baseUrl).toBe('https://env.test');
    expect(config.token).toBe('env-token');
  });

  it('lets explicit options beat the environment', () => {
    process.env.OKTA_CONNECT_BASE_URL = 'https://env.test';
    process.env.OKTA_CONNECT_TOKEN = 'env-token';

    const config = resolveConfig({ baseUrl: 'https://explicit.test', token: 'explicit' });

    expect(config.baseUrl).toBe('https://explicit.test');
    expect(config.token).toBe('explicit');
  });

  it('throws a clear error when the base URL is missing', () => {
    delete process.env.OKTA_CONNECT_BASE_URL;

    expect(() => resolveConfig({ token: 'tok' })).toThrow(/baseUrl is required/);
  });

  it('throws a clear error when the token is missing', () => {
    delete process.env.OKTA_CONNECT_TOKEN;

    expect(() => resolveConfig({ baseUrl: 'https://connect.test' })).toThrow(
      /token is required/,
    );
  });

  it('rejects a base URL that is not absolute http(s)', () => {
    expect(() => resolveConfig({ baseUrl: 'connect.test', token: 'tok' })).toThrow(
      InvalidArgumentError,
    );
    expect(() => resolveConfig({ baseUrl: 'ftp://connect.test', token: 'tok' })).toThrow(
      InvalidArgumentError,
    );
  });

  it('treats an empty env var as unset', () => {
    process.env.OKTA_CONNECT_TOKEN = '';

    expect(() => resolveConfig({ baseUrl: 'https://connect.test' })).toThrow(
      /token is required/,
    );
  });

  it('clamps a negative retry budget to zero', () => {
    expect(resolveConfig({ baseUrl: 'https://c.test', token: 't', maxRetries: -5 }).maxRetries).toBe(
      0,
    );
  });

  it('appends a caller suffix to the User-Agent', () => {
    const config = resolveConfig({
      baseUrl: 'https://c.test',
      token: 't',
      userAgent: 'my-crm/2.1',
    });

    expect(config.userAgent).toMatch(/ my-crm\/2\.1$/);
  });
});

describe('OktaConnect construction', () => {
  it('exposes the normalised base URL and the transport', () => {
    process.env.OKTA_CONNECT_BASE_URL = 'https://connect.test/';
    process.env.OKTA_CONNECT_TOKEN = 'tok';

    const client = new OktaConnect();

    expect(client.baseUrl).toBe('https://connect.test');
    expect(client.http).toBeDefined();
  });

  it('wires up every resource accessor', () => {
    const client = new OktaConnect({ baseUrl: 'https://connect.test', token: 'tok' });

    for (const name of [
      'messages',
      'conversations',
      'contacts',
      'channels',
      'templates',
      'webhooks',
      'emails',
      'socialPosts',
      'campaigns',
      'tickets',
      'tags',
      'analytics',
      'groups',
      'embedTokens',
      'meta',
      'qr',
    ] as const) {
      expect(client[name], `client.${name} should be wired`).toBeDefined();
    }

    expect(client.emails.templates).toBeDefined();
    expect(client.emails.broadcasts).toBeDefined();
    expect(client.emails.suppressions).toBeDefined();
  });

  it('builds an Embed bound to the client base URL', () => {
    const client = new OktaConnect({ baseUrl: 'https://connect.test', token: 'tok' });

    const url = client.embed('secret').inboxUrl({ sub: 'u-1', email: 'a@b.c' });

    expect(url.startsWith('https://connect.test/app/inbox')).toBe(true);
  });
});
