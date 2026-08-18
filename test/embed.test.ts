import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Embed, EmbedScope, InvalidArgumentError, UiHide, validateUiHide } from '../src/index.js';

const SECRET = 'embed-shared-secret';
const USER = { sub: 'partner-user-7', email: 'op@acme.com', name: 'Op' };

function decode(token: string): { header: Record<string, unknown>; payload: Record<string, unknown> } {
  const [header, payload] = token.split('.');

  return {
    header: JSON.parse(Buffer.from(header!, 'base64url').toString('utf8')),
    payload: JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')),
  };
}

function signatureIsValid(token: string, secret = SECRET): boolean {
  const [header, payload, signature] = token.split('.');
  const expected = createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return signature === expected;
}

describe('Embed', () => {
  const embed = new Embed('https://connect.test', SECRET);

  it('mints a valid HS256 JWT', () => {
    const token = embed.sessionToken(USER);
    const { header, payload } = decode(token);

    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(signatureIsValid(token)).toBe(true);
    expect(payload).toMatchObject({
      iss: 'okta-web',
      aud: 'okta-whatsapp',
      sub: 'partner-user-7',
      email: 'op@acme.com',
      name: 'Op',
      scope: EmbedScope.INBOX,
    });
    expect(typeof payload.jti).toBe('string');
    expect(payload.exp as number).toBeGreaterThan(payload.iat as number);
  });

  it('emits base64url with no padding', () => {
    const token = embed.sessionToken(USER);

    expect(token).not.toContain('=');
    expect(token).not.toContain('+');
    expect(token).not.toContain('/');
    expect(token.split('.')).toHaveLength(3);
  });

  it('mints a fresh jti each time (replay protection)', () => {
    const first = decode(embed.ssoToken(USER)).payload.jti;
    const second = decode(embed.ssoToken(USER)).payload.jti;

    expect(first).not.toBe(second);
  });

  it('honours a custom issuer and audience', () => {
    const custom = new Embed('https://connect.test', SECRET, {
      issuer: 'acme-portal',
      audience: 'okta-connect',
    });

    expect(decode(custom.sessionToken(USER)).payload).toMatchObject({
      iss: 'acme-portal',
      aud: 'okta-connect',
    });
  });

  it('defaults the display name to an empty string', () => {
    expect(decode(embed.sessionToken({ sub: 'u-1', email: 'a@b.c' })).payload.name).toBe('');
  });

  describe('ttl bounds', () => {
    it('caps the one-shot SSO token at 5 minutes', () => {
      expect(() => embed.ssoToken(USER, { ttlSeconds: 300 })).not.toThrow();
      expect(() => embed.ssoToken(USER, { ttlSeconds: 301 })).toThrow(InvalidArgumentError);
    });

    it('caps the cookieless session token at 4 hours', () => {
      expect(() => embed.sessionToken(USER, { ttlSeconds: 14_400 })).not.toThrow();
      expect(() => embed.sessionToken(USER, { ttlSeconds: 14_401 })).toThrow(
        InvalidArgumentError,
      );
    });

    it('rejects a zero or negative ttl', () => {
      expect(() => embed.sessionToken(USER, { ttlSeconds: 0 })).toThrow(InvalidArgumentError);
      expect(() => embed.sessionToken(USER, { ttlSeconds: -60 })).toThrow(InvalidArgumentError);
    });
  });

  describe('urls', () => {
    it('builds the SSO landing URL with an encoded redirect', () => {
      const url = embed.ssoUrl(USER, '/app/inbox?embedded=1');

      expect(url.startsWith('https://connect.test/embed/sso?token=')).toBe(true);
      expect(url).toContain('&redirect=%2Fapp%2Finbox%3Fembedded%3D1');
    });

    it('builds a cookieless inbox URL scoped to the inbox', () => {
      const url = embed.inboxUrl(USER);
      const token = new URL(url).searchParams.get('embed_token')!;

      expect(url).toContain('/app/inbox');
      expect(decode(token).payload.scope).toBe(EmbedScope.INBOX);
      expect(signatureIsValid(token)).toBe(true);
    });

    it('preserves existing query params when appending the token', () => {
      const url = embed.embedUrl('/app/inbox?embedded=1', USER);

      expect(url).toContain('/app/inbox?embedded=1&embed_token=');
    });

    it('adds the token with ? when the path carries no query', () => {
      expect(embed.embedUrl('/app/inbox', USER)).toContain('/app/inbox?embed_token=');
    });

    it('exposes the header alternative to a query-string token', () => {
      expect(embed.tokenHeader('abc')).toEqual({ 'X-Embed-Token': 'abc' });
    });
  });

  describe('validation', () => {
    it('refuses an empty secret', () => {
      expect(() => new Embed('https://connect.test', '')).toThrow(InvalidArgumentError);
    });

    it('refuses a user without sub or email', () => {
      expect(() => embed.sessionToken({ sub: '', email: 'a@b.c' })).toThrow(InvalidArgumentError);
      expect(() => embed.sessionToken({ sub: 'u-1', email: '' })).toThrow(InvalidArgumentError);
    });

    it('refuses an unknown scope', () => {
      expect(() =>
        embed.sessionToken(USER, { scope: 'platform.root' as never }),
      ).toThrow(InvalidArgumentError);
    });

    it('refuses an unknown ui_hide key at mint time', () => {
      expect(() => embed.inboxUrl(USER, { uiHide: ['ai', 'nope'] })).toThrow(
        InvalidArgumentError,
      );
    });

    it('carries validated ui_hide keys into the claims', () => {
      const token = embed.inboxUrl(USER, { uiHide: [UiHide.AI, UiHide.ASSIGN_AGENT] });
      const payload = decode(new URL(token).searchParams.get('embed_token')!).payload;

      expect(payload.ui_hide).toEqual(['ai', 'assign_agent']);
    });

    it('omits ui_hide entirely when none are requested', () => {
      expect(decode(embed.sessionToken(USER)).payload.ui_hide).toBeUndefined();
    });
  });
});

describe('validateUiHide', () => {
  it('de-duplicates and drops blanks', () => {
    expect(validateUiHide(['ai', '', 'ai', 'snooze'])).toEqual(['ai', 'snooze']);
  });

  it('throws on an unknown key, naming the allowed set', () => {
    expect(() => validateUiHide(['typo'])).toThrow(/Unknown ui_hide key "typo"/);
  });
});
