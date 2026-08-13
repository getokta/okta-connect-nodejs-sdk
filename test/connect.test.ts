import { describe, expect, it } from 'vitest';
import {
  Connect,
  hasAbilities,
  InvalidArgumentError,
  missingAbilities,
  OktaConnect,
  OktaConnectError,
} from '../src/index.js';
import { stubFetch } from './helpers.js';

const REDIRECT = 'https://crm.example.com/okta/callback';

describe('authorizationUrl', () => {
  const connect = new Connect('https://connect.test');

  it('builds the consent URL with the requested abilities', () => {
    const url = new URL(
      connect.authorizationUrl({
        appName: 'My CRM',
        redirectUri: REDIRECT,
        abilities: ['read', 'send'],
        state: 'abc123',
      }),
    );

    expect(url.origin + url.pathname).toBe('https://connect.test/connect');
    expect(url.searchParams.get('app_name')).toBe('My CRM');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(url.searchParams.get('abilities')).toBe('read,send');
    expect(url.searchParams.get('state')).toBe('abc123');
  });

  it('defaults to the read ability', () => {
    const url = new URL(connect.authorizationUrl({ appName: 'X', redirectUri: REDIRECT }));

    expect(url.searchParams.get('abilities')).toBe('read');
  });

  it('drops abilities the consent screen would not understand', () => {
    const url = new URL(
      connect.authorizationUrl({
        appName: 'X',
        redirectUri: REDIRECT,
        abilities: ['read', 'root' as never],
      }),
    );

    expect(url.searchParams.get('abilities')).toBe('read');
  });

  it('falls back to read when every requested ability is unknown', () => {
    const url = new URL(
      connect.authorizationUrl({
        appName: 'X',
        redirectUri: REDIRECT,
        abilities: ['root' as never],
      }),
    );

    expect(url.searchParams.get('abilities')).toBe('read');
  });

  it('includes the logo only when supplied', () => {
    const withLogo = new URL(
      connect.authorizationUrl({
        appName: 'X',
        redirectUri: REDIRECT,
        logoUrl: 'https://cdn.test/logo.png',
      }),
    );
    const without = new URL(connect.authorizationUrl({ appName: 'X', redirectUri: REDIRECT }));

    expect(withLogo.searchParams.get('logo')).toBe('https://cdn.test/logo.png');
    expect(without.searchParams.has('logo')).toBe(false);
    expect(without.searchParams.has('state')).toBe(false);
  });

  it('rejects a non-absolute base URL', () => {
    expect(() => new Connect('connect.test')).toThrow(InvalidArgumentError);
  });
});

describe('generateState', () => {
  it('produces a long, unguessable, unique value', () => {
    const first = Connect.generateState();
    const second = Connect.generateState();

    expect(first).toMatch(/^[0-9a-f]{48}$/);
    expect(first).not.toBe(second);
  });

  it('enforces a 16-byte floor', () => {
    expect(Connect.generateState(4)).toHaveLength(32);
  });
});

describe('handleCallback', () => {
  function connectWith(response: Parameters<typeof stubFetch>[0]) {
    const stub = stubFetch(response);

    return { connect: new Connect('https://connect.test', { fetch: stub.fetch }), stub };
  }

  it('exchanges the code and normalises the token', async () => {
    const { connect, stub } = connectWith({
      body: { data: { access_token: 'tok_123', abilities: ['read', 'send'] } },
    });

    const token = await connect.handleCallback(
      { code: 'code-1', state: 'abc' },
      REDIRECT,
      'abc',
    );

    expect(stub.last().path).toBe('/api/v1/oauth/token');
    expect(stub.last().body).toEqual({ code: 'code-1', redirect_uri: REDIRECT });
    expect(token.access_token).toBe('tok_123');
    expect(token.token_type).toBe('Bearer');
    expect(token.expires_at).toBeNull();
  });

  it('accepts an unwrapped token payload', async () => {
    const { connect } = connectWith({ body: { access_token: 'tok_bare' } });

    const token = await connect.exchange('code-1', REDIRECT);

    expect(token.access_token).toBe('tok_bare');
    expect(token.abilities).toEqual([]);
  });

  it('rejects a denied consent', async () => {
    const { connect, stub } = connectWith({ body: {} });

    await expect(
      connect.handleCallback({ error: 'access_denied' }, REDIRECT, 'abc'),
    ).rejects.toThrow(/Authorization was not granted: access_denied/);
    expect(stub.callCount()).toBe(0);
  });

  it('rejects a state mismatch as CSRF', async () => {
    const { connect, stub } = connectWith({ body: {} });

    await expect(
      connect.handleCallback({ code: 'code-1', state: 'wrong' }, REDIRECT, 'abc'),
    ).rejects.toThrow(/state mismatch/);
    expect(stub.callCount()).toBe(0);
  });

  it('rejects a missing state when one was expected', async () => {
    const { connect } = connectWith({ body: {} });

    await expect(
      connect.handleCallback({ code: 'code-1' }, REDIRECT, 'abc'),
    ).rejects.toThrow(/state mismatch/);
  });

  it('rejects a callback with no code', async () => {
    const { connect } = connectWith({ body: {} });

    await expect(connect.handleCallback({ state: 'abc' }, REDIRECT, 'abc')).rejects.toThrow(
      /carried no code/,
    );
  });

  it('skips the state check when none was supplied', async () => {
    const { connect } = connectWith({ body: { data: { access_token: 'tok' } } });

    await expect(connect.handleCallback({ code: 'code-1' }, REDIRECT)).resolves.toMatchObject({
      access_token: 'tok',
    });
  });

  it('raises when the exchange returns no token', async () => {
    const { connect } = connectWith({ body: { data: {} } });

    await expect(connect.exchange('code-1', REDIRECT)).rejects.toBeInstanceOf(OktaConnectError);
  });

  it('surfaces a rejected code as an API error', async () => {
    const { connect } = connectWith({
      status: 400,
      body: { message: 'The authorization code is invalid or expired.' },
    });

    await expect(connect.exchange('used-code', REDIRECT)).rejects.toThrow(
      /invalid or expired/,
    );
  });

  it('refuses an empty code before making a request', async () => {
    const { connect, stub } = connectWith({ body: {} });

    await expect(connect.exchange('', REDIRECT)).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(stub.callCount()).toBe(0);
  });
});

describe('OktaConnect.connect', () => {
  it('returns a token-less Connect for the given host', () => {
    expect(OktaConnect.connect('https://connect.test')).toBeInstanceOf(Connect);
  });
});

describe('ability helpers', () => {
  it('reports coverage and gaps', () => {
    expect(hasAbilities(['read', 'send'], ['read'])).toBe(true);
    expect(hasAbilities(['read'], ['read', 'send'])).toBe(false);
    expect(missingAbilities(['read'], ['read', 'admin'])).toEqual(['admin']);
    expect(missingAbilities(['read', 'admin'], ['read'])).toEqual([]);
  });
});
