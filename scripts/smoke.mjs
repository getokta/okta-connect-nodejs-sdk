/**
 * Smoke-test the built ESM bundle.
 *
 * The vitest suite exercises `src/`, which proves the logic but says nothing
 * about what actually ships. This loads `dist/index.js` the way a consumer
 * would and checks the package is wired together — and, because it needs only
 * the language runtime, it doubles as the Node 18 compatibility gate (the test
 * runner itself requires Node 20+).
 *
 *   node scripts/smoke.mjs
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const {
  Connect,
  Embed,
  HtmlMessageBuilder,
  OktaConnect,
  OktaConnectError,
  Page,
  UiHide,
  ValidationError,
  WebhookEvents,
  WebhookRouter,
  parseWebhook,
  verifyWebhookSignature,
} = await import('../dist/index.js');

const client = new OktaConnect({ baseUrl: 'https://connect.test/', token: 'tok' });

// The base URL is normalised, and every resource accessor is wired.
assert.equal(client.baseUrl, 'https://connect.test');

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
]) {
  assert.ok(client[name], `client.${name} should be wired`);
}

assert.ok(client.emails.templates && client.emails.broadcasts && client.emails.suppressions);

// A real request round-trips through the transport against an injected fetch.
let seen;
const stubbed = new OktaConnect({
  baseUrl: 'https://connect.test',
  token: 'tok',
  fetch: async (url, init) => {
    seen = { url, method: init?.method, body: JSON.parse(init?.body ?? '{}'), headers: init?.headers };

    return new Response(JSON.stringify({ data: { id: '01HMSG', status: 'queued' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  },
});

const message = await stubbed.messages.sendText('01HCH', '966500000000', 'Hello');
assert.equal(message.status, 'queued');
assert.equal(seen.url, 'https://connect.test/api/v1/messages');
assert.equal(seen.method, 'POST');
assert.deepEqual(seen.body, {
  channel_id: '01HCH',
  wa_id: '966500000000',
  type: 'text',
  body: 'Hello',
});
assert.equal(seen.headers.authorization, 'Bearer tok');

// Errors map to their typed class and keep the API's message.
const failing = new OktaConnect({
  baseUrl: 'https://connect.test',
  token: 'tok',
  maxRetries: 0,
  fetch: async () =>
    new Response(JSON.stringify({ message: 'nope', errors: { wa_id: ['required'] } }), {
      status: 422,
      headers: { 'content-type': 'application/json' },
    }),
});

await assert.rejects(
  () => failing.contacts.upsert({ wa_id: '' }),
  (error) => {
    assert.ok(error instanceof ValidationError);
    assert.ok(error instanceof OktaConnectError);
    assert.equal(error.status, 422);
    assert.deepEqual(error.fields, ['wa_id']);

    return true;
  },
);

// Pagination.
const page = new Page({ data: [{ id: 'a' }, { id: 'b' }], meta: { current_page: 1, last_page: 2 } });
assert.equal(page.length, 2);
assert.equal(page.hasMore, true);
assert.equal(page.nextPage, 2);
assert.deepEqual([...page].map((item) => item.id), ['a', 'b']);

// Webhook verification + routing.
const secret = 'whsec_test';
const body = JSON.stringify({
  event: WebhookEvents.MessageReceived,
  organization_id: 42,
  payload: { message: { body: 'Hi' }, conversation: { id: '01HCONV' } },
});
const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

assert.equal(verifyWebhookSignature(body, signature, secret), true);
assert.equal(verifyWebhookSignature(`${body} `, signature, secret), false);
assert.equal(parseWebhook(body, signature, secret).payload.conversation.id, '01HCONV');

let routed = 0;
await new WebhookRouter(secret).onMessage(() => (routed += 1)).dispatch(body, signature);
assert.equal(routed, 1);

// Embed minting produces a verifiable HS256 JWT.
const embedUrl = new Embed('https://connect.test', 'embed-secret').inboxUrl(
  { sub: 'u-1', email: 'op@acme.com' },
  { uiHide: [UiHide.AI] },
);
const token = new URL(embedUrl).searchParams.get('embed_token');
const [header, payloadPart, sig] = token.split('.');
const expected = createHmac('sha256', 'embed-secret')
  .update(`${header}.${payloadPart}`)
  .digest('base64url');

assert.equal(sig, expected, 'embed token signature should verify');
assert.deepEqual(
  JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')).ui_hide,
  ['ai'],
);

// Connect builds a consent URL without needing a token.
const consent = new URL(
  new Connect('https://connect.test').authorizationUrl({
    appName: 'Smoke',
    redirectUri: 'https://app.test/cb',
    abilities: ['read', 'send'],
  }),
);
assert.equal(consent.pathname, '/connect');
assert.equal(consent.searchParams.get('abilities'), 'read,send');

// The email builder escapes text and emits a full document.
const html = HtmlMessageBuilder.make().heading('<script>x</script>').toHtml();
assert.ok(html.startsWith('<!DOCTYPE html>'));
assert.ok(html.includes('&lt;script&gt;'));
assert.ok(!html.includes('<script>'));

console.log(`ESM smoke passed on Node ${process.version}`);
