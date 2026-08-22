import { describe, expect, it } from 'vitest';
import { AuthenticationError, InvalidArgumentError, PartnerClient } from '../src/index.js';
import { stubFetch, type StubResponse } from './helpers.js';

/** The `POST /api/v1/partner/token` body. */
function tokenResponse(token = 'okc_pat_first', expiresIn = 3600): StubResponse {
  return {
    status: 200,
    body: {
      access_token: token,
      token_type: 'Bearer',
      expires_in: expiresIn,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      abilities: ['workspaces.write', 'tokens.write'],
    },
  };
}

function partnerClient(responses: StubResponse[], staticToken?: string) {
  const stub = stubFetch(responses);

  const client = new PartnerClient({
    baseUrl: 'https://connect.test',
    maxRetries: 0,
    fetch: stub.fetch,
    ...(staticToken ? { staticToken } : { clientId: 'okc_ci_x', clientSecret: 'okc_cs_x' }),
  });

  return { client, stub };
}

describe('PartnerClient credentials', () => {
  it('refuses to construct without a key pair or a static token', () => {
    expect(() => new PartnerClient({ baseUrl: 'https://connect.test' })).toThrow(
      InvalidArgumentError,
    );
  });
});

describe('partner token lifecycle', () => {
  it('exchanges the key pair once and reuses the token', async () => {
    const { client, stub } = partnerClient([
      tokenResponse('okc_pat_live'),
      { body: { data: { partner: { id: 'p1' } }, token: {} } },
      { body: { data: [], meta: {}, links: {} } },
    ]);

    await client.me();
    await client.workspaces.list();

    expect(stub.callCount()).toBe(3);
    expect(stub.requests[0]!.path).toBe('/api/v1/partner/token');

    // The key pair in the body is the credential; no bearer rides along.
    expect(stub.requests[0]!.headers.authorization).toBeUndefined();

    expect(stub.requests[1]!.headers.authorization).toBe('Bearer okc_pat_live');
    expect(stub.requests[2]!.headers.authorization).toBe('Bearer okc_pat_live');
  });

  it('shares one in-flight exchange across concurrent callers', async () => {
    const { client, stub } = partnerClient([
      tokenResponse('okc_pat_live'),
      { body: { data: [], meta: {}, links: {} } },
    ]);

    // Three provisioning calls starting at once must not become three token
    // requests — /token is rate-limited at 10/min.
    await Promise.all([
      client.workspaces.list(),
      client.workspaces.list(),
      client.workspaces.list(),
    ]);

    const exchanges = stub.requests.filter((r) => r.path === '/api/v1/partner/token');
    expect(exchanges).toHaveLength(1);
  });

  it('re-exchanges once when a call comes back 401', async () => {
    const { client, stub } = partnerClient([
      tokenResponse('okc_pat_stale'),
      { status: 401, body: { error: 'invalid_token' } },
      tokenResponse('okc_pat_fresh'),
      { body: { data: [], meta: {}, links: {} } },
    ]);

    await client.workspaces.list();

    expect(stub.callCount()).toBe(4);
    expect(stub.requests[2]!.path).toBe('/api/v1/partner/token');
    expect(stub.requests[3]!.headers.authorization).toBe('Bearer okc_pat_fresh');
  });

  it('gives up after one retry rather than looping', async () => {
    const { client } = partnerClient([
      tokenResponse('okc_pat_stale'),
      { status: 401, body: { error: 'invalid_token' } },
      tokenResponse('okc_pat_fresh'),
      { status: 401, body: { error: 'invalid_token' } },
    ]);

    await expect(client.workspaces.list()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('uses a static token verbatim and never exchanges', async () => {
    const { client, stub } = partnerClient(
      [{ body: { data: [], meta: {}, links: {} } }],
      'okc_pst_dev',
    );

    await client.workspaces.list();

    expect(stub.callCount()).toBe(1);
    expect(stub.last().path).toBe('/api/v1/partner/workspaces');
    expect(stub.last().headers.authorization).toBe('Bearer okc_pst_dev');
  });

  it('does not try to refresh a static token on 401', async () => {
    const { client, stub } = partnerClient(
      [{ status: 401, body: { error: 'invalid_token' } }],
      'okc_pst_dev',
    );

    await expect(client.workspaces.list()).rejects.toBeInstanceOf(AuthenticationError);

    // Nothing to exchange, so the 401 is the answer.
    expect(stub.callCount()).toBe(1);
  });

  it('refreshes before a near-expiry token is used', async () => {
    const { client, stub } = partnerClient([
      // Inside the 60s skew window the moment it is issued.
      tokenResponse('okc_pat_short', 30),
      tokenResponse('okc_pat_next', 3600),
      { body: { data: [], meta: {}, links: {} } },
    ]);

    await client.accessToken();
    await client.workspaces.list();

    expect(stub.last().headers.authorization).toBe('Bearer okc_pat_next');
  });

  it('narrows the exchanged token when abilities are named', async () => {
    const stub = stubFetch([tokenResponse(), { body: { data: [], meta: {}, links: {} } }]);

    const client = new PartnerClient({
      baseUrl: 'https://connect.test',
      clientId: 'okc_ci_x',
      clientSecret: 'okc_cs_x',
      abilities: ['workspaces.read'],
      maxRetries: 0,
      fetch: stub.fetch,
    });

    await client.workspaces.list();

    expect(stub.requests[0]!.body).toMatchObject({
      grant_type: 'client_credentials',
      abilities: ['workspaces.read'],
    });
  });
});

describe('partner provisioning', () => {
  it('reports a created workspace and carries the owner password', async () => {
    const { client, stub } = partnerClient([
      tokenResponse(),
      {
        status: 201,
        body: {
          data: { id: 'ws_1', name: 'Acme Support', status: 'active', external_id: 'acct_8891' },
          owner: { id: 'usr_1', email: 'sara@acme.test', one_time_password: 'generated-once' },
        },
      },
    ]);

    const result = await client.workspaces.create({
      name: 'Acme Support',
      external_id: 'acct_8891',
      owner: { name: 'Sara', email: 'sara@acme.test', password_auto: true },
    });

    expect(result.created).toBe(true);
    expect(result.workspace.id).toBe('ws_1');
    expect(result.oneTimePassword).toBe('generated-once');
    expect(stub.last().path).toBe('/api/v1/partner/workspaces');
  });

  it('reports a repeated external_id as matched, not created', async () => {
    const { client } = partnerClient([
      tokenResponse(),
      // 200, not 201 — the platform matched the external_id.
      { status: 200, body: { data: { id: 'ws_1', external_id: 'acct_8891' } } },
    ]);

    const result = await client.workspaces.create({ name: 'Acme', external_id: 'acct_8891' });

    expect(result.created).toBe(false);
    expect(result.oneTimePassword).toBeUndefined();
  });

  it('answers null for an unknown external_id without creating anything', async () => {
    const { client, stub } = partnerClient([
      tokenResponse(),
      { body: { data: [], meta: {}, links: {} } },
    ]);

    await expect(client.workspaces.findByExternalId('acct_unknown')).resolves.toBeNull();
    expect(stub.last().method).toBe('GET');
    expect(stub.last().query.get('external_id')).toBe('acct_unknown');
  });

  it('reports a reused account when the email already exists', async () => {
    const { client } = partnerClient([
      tokenResponse(),
      // 200 — Connect knew this email and simply attached it.
      { status: 200, body: { data: { id: 'usr_9', email: 'khalid@acme.test', role: 'agent' } } },
    ]);

    const result = await client.users.add('ws_1', {
      name: 'Khalid',
      email: 'khalid@acme.test',
      role: 'agent',
      password_auto: true,
    });

    expect(result.created).toBe(false);
    // A reused account keeps its own password; none comes back, and that is
    // success rather than a missing field.
    expect(result.oneTimePassword).toBeUndefined();
  });

  it('fills in the token identifier from whichever name the platform used', async () => {
    const { client } = partnerClient([
      tokenResponse(),
      {
        status: 201,
        // The mint response's original name — no `id` in sight.
        body: { data: { token: 'okc_wt_plain', token_id: 42, abilities: ['read', 'send'] } },
      },
    ]);

    const token = await client.tokens.create('ws_1', {
      name: 'Acme product sync',
      user_id: 'usr_1',
      abilities: ['read', 'send'],
    });

    expect(token.token).toBe('okc_wt_plain');
    expect(token.id).toBe(42);
    expect(token.token_id).toBe(42);
  });

  it('revokes a token by its numeric id', async () => {
    const { client, stub } = partnerClient([tokenResponse(), { body: { revoked: true } }]);

    await expect(client.tokens.revoke('ws_1', 42)).resolves.toBe(true);
    expect(stub.last().method).toBe('DELETE');
    expect(stub.last().path).toBe('/api/v1/partner/workspaces/ws_1/tokens/42');
  });

  it('issues a short-lived sign-in link', async () => {
    const { client, stub } = partnerClient([
      tokenResponse(),
      {
        status: 201,
        body: { data: { url: 'https://connect.test/partner/sso?ticket=abc', expires_in: 300 } },
      },
    ]);

    const link = await client.sso.issue('ws_1', 'usr_1', '/app/inbox');

    expect(link.url).toContain('ticket=abc');
    expect(link.expires_in).toBe(300);
    expect(stub.last().body).toMatchObject({ user_id: 'usr_1', redirect: '/app/inbox' });
  });

  it('refuses to build a workspace client from a token with no secret', async () => {
    const { client } = partnerClient([
      tokenResponse(),
      { body: { data: [{ id: 7, name: 'sync', abilities: ['read'] }] } },
    ]);

    const [listed] = await client.tokens.list('ws_1');

    // A token read back from a list carries no secret — saying so beats a 401
    // three calls later.
    expect(() => client.workspaceClient(listed!)).toThrow(InvalidArgumentError);
  });

  it('builds a tenant client from a freshly minted token', async () => {
    const { client } = partnerClient([
      tokenResponse(),
      { status: 201, body: { data: { token: 'okc_wt_plain', id: 7 } } },
    ]);

    const token = await client.tokens.create('ws_1', { name: 'sync', user_id: 'usr_1' });
    const workspace = client.workspaceClient(token);

    expect(workspace.contacts).toBeDefined();
  });
});

describe('partner embed', () => {
  it('issues a key and reports the issuer to sign with', async () => {
    const { client, stub } = partnerClient([
      tokenResponse(),
      {
        status: 201,
        body: {
          data: {
            secret: 'okc_es_live',
            secret_id: '01J',
            issuer: 'partner:01HZK',
            origins: ['https://mygurb.com'],
          },
        },
      },
    ]);

    const secret = await client.embed.issueSecret(['https://mygurb.com']);

    expect(secret.secret).toBe('okc_es_live');
    expect(secret.issuer).toBe('partner:01HZK');
    expect(stub.last().path).toBe('/api/v1/partner/embed/secret');
  });

  it('surfaces the origins the platform refused', async () => {
    const { client, stub } = partnerClient([
      tokenResponse(),
      { body: { data: { origins: ['https://mygurb.com'], rejected: ['*', 'not a url'] } } },
    ]);

    const result = await client.embed.setOrigins(['mygurb.com', '*', 'not a url']);

    expect(result.rejected).toEqual(['*', 'not a url']);
    expect(stub.last().method).toBe('PUT');
  });

  it('derives the partner issuer instead of trusting a typed one', async () => {
    const { client } = partnerClient([
      tokenResponse(),
      { body: { data: { issued: true, issuer: 'partner:01HZK', audience: 'okta-whatsapp' } } },
    ]);

    const embed = await client.embedSigner('okc_es_live');
    const token = embed.sessionToken({ sub: 'gurb-1', email: 'op@mygurb.test' });

    expect(claims(token).iss).toBe('partner:01HZK');
  });

  it('carries a named workspace through as the workspace claim', async () => {
    const { client } = partnerClient([
      tokenResponse(),
      { body: { data: { issued: true, issuer: 'partner:01HZK' } } },
    ]);

    const embed = await client.embedSigner('okc_es_live');

    const named = embed.sessionToken({
      sub: 'gurb-1',
      email: 'op@mygurb.test',
      workspace: 'ws_second',
    });
    expect(claims(named).workspace).toBe('ws_second');

    // Omitted entirely when there is nothing to name, so the platform falls
    // back to the oldest membership.
    const plain = embed.sessionToken({ sub: 'gurb-1', email: 'op@mygurb.test' });
    expect(claims(plain)).not.toHaveProperty('workspace');
  });
});

function claims(jwt: string): Record<string, unknown> {
  const body = jwt.split('.')[1] ?? '';

  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>;
}

describe('meta embedded signup', () => {
  it('finalises with the code alone when the postMessage never arrived', async () => {
    const stub = stubFetch([{ status: 201, body: { channels: [{ id: 'ch_1' }] } }]);

    const { OktaConnect } = await import('../src/index.js');
    const client = new OktaConnect({
      baseUrl: 'https://connect.test',
      token: 'tenant-token',
      maxRetries: 0,
      fetch: stub.fetch,
    });

    const channels = await client.meta.completeEmbeddedSignup('CODE_FROM_FB');

    expect(channels).toHaveLength(1);
    // An explicit empty waba_id, not an absent key: the platform treats empty
    // as "derive it from the token".
    expect(stub.last().body).toMatchObject({ code: 'CODE_FROM_FB', waba_id: '' });
  });
});
