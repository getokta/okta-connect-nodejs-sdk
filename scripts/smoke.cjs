/**
 * Smoke-test the built CommonJS bundle.
 *
 * The dual build means `require()` and `import` load different files, so ESM
 * passing says nothing about CJS. This checks the `require` path resolves, the
 * error classes still subclass correctly through the interop layer, and the
 * pieces that touch `node:crypto` work.
 *
 *   node scripts/smoke.cjs
 */
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');

const {
  Connect,
  Embed,
  HtmlMessageBuilder,
  OktaConnect,
  OktaConnectError,
  RateLimitError,
  ValidationError,
  WebhookEvents,
  WebhookRouter,
  verifyWebhookSignature,
} = require('../dist/index.cjs');

const client = new OktaConnect({ baseUrl: 'https://connect.test/', token: 'tok' });
assert.equal(client.baseUrl, 'https://connect.test');
assert.ok(client.messages && client.emails && client.socialPosts && client.qr);

// Subclassing must survive the CJS interop, or `instanceof` checks in consumer
// catch blocks silently stop matching.
assert.ok(new ValidationError('x') instanceof OktaConnectError);
assert.ok(new RateLimitError('x', { retryAfter: 5 }) instanceof OktaConnectError);
assert.equal(new RateLimitError('x', { retryAfter: 5 }).retryAfter, 5);

const secret = 'whsec_test';
const body = JSON.stringify({ event: WebhookEvents.ChannelDeleted, payload: { channel_id: '01HCH' } });
const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

assert.equal(verifyWebhookSignature(body, signature, secret), true);

const consent = new URL(
  new Connect('https://connect.test').authorizationUrl({
    appName: 'Smoke',
    redirectUri: 'https://app.test/cb',
  }),
);
assert.equal(consent.searchParams.get('abilities'), 'read');

const embedToken = new Embed('https://connect.test', 'embed-secret').sessionToken({
  sub: 'u-1',
  email: 'op@acme.com',
});
assert.equal(embedToken.split('.').length, 3);

assert.ok(HtmlMessageBuilder.make(false).paragraph('<b>').toHtml().includes('&lt;b&gt;'));

(async () => {
  let routed = 0;
  await new WebhookRouter(secret).onChannel(() => (routed += 1)).dispatch(body, signature);
  assert.equal(routed, 1);

  console.log(`CJS smoke passed on Node ${process.version}`);
})();
