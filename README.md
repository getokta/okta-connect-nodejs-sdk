# Okta Connect Node.js SDK

[![Node](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/types-included-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

The official Node.js / TypeScript client for **[Okta Connect](https://connect.getokta.io)** —
the omnichannel platform for WhatsApp messaging, transactional + bulk email,
social publishing and broadcast campaigns.

- **Zero runtime dependencies.** Built on the platform `fetch` and `node:crypto`.
- **Types included**, generated from the live API's own response shapes.
- **ESM + CommonJS**, both shipped from one package.
- Sensible retries, typed errors, auto-pagination, HMAC webhook verification,
  and local JWT minting for the embedded inbox.

## Installation

```bash
npm install @getokta/okta-connect-sdk
```

Requires **Node 18.17+** (for global `fetch`). Works in Deno and Bun; in edge
runtimes without `node:crypto`, the API client works but `Embed` and the
webhook verification helpers do not.

## Quickstart

```ts
import { OktaConnect } from '@getokta/okta-connect-sdk';

const client = new OktaConnect({
  baseUrl: 'https://connect.getokta.io',
  token: process.env.OKTA_CONNECT_TOKEN,
});

// Send a WhatsApp message
await client.messages.sendText(channelId, '966500000000', 'Your order is on the way!');

// Read the inbox
const conversations = await client.conversations.list({ status: 'open' });
for (const conversation of conversations) {
  console.log(conversation.id, conversation.unread_count);
}
```

`baseUrl` and `token` fall back to `OKTA_CONNECT_BASE_URL` and
`OKTA_CONNECT_TOKEN`, so `new OktaConnect()` is enough when those are set.

### Abilities

A token carries a subset of `read`, `write`, `send`, `webhooks`, `admin`, and
each endpoint states which it needs. A call outside the grant raises
`AuthorizationError` (403). Check up front with:

```ts
const connection = await client.connection();
connection.abilities;                       // ['read', 'send']
await client.can('admin');                  // false
await client.missing(['read', 'admin']);    // ['admin']
```

## Messaging

```ts
// Typed helpers build the right payload shape for you
await client.messages.sendText(channelId, '966500000000', 'Hello');
await client.messages.sendMedia(channelId, '966500000000', 'image', 'https://cdn.acme.com/a.jpg', 'Look!');
await client.messages.reply(conversationId, 'Thanks!');

// …or send a raw payload
await client.messages.send({
  channel_id: channelId,
  wa_id: '966500000000',     // E.164 without the leading +
  type: 'text',
  body: 'Hello',
});

// Conversations and their messages
const conversation = await client.conversations.get(conversationId);
const messages = await client.conversations.messages(conversationId, { per_page: 50 });
```

Media is **not** uploaded through the platform: pass a publicly fetchable HTTPS
URL and the provider fetches it, so keep it reachable until delivery.

### Contacts and tags

```ts
// The upsert is keyed on wa_id — E.164 without the leading `+`
await client.contacts.upsert({ wa_id: '966500000000', name: 'Ali', phone: '+966500000000' });

await client.contacts.list({ search: '+966' });
await client.tags.applyToContact(contactId, ['vip', 'riyadh']);   // unknown slugs are created
```

### Channels

`type` takes a channel type (`cloud_api`, `baileys`, `telegram`, `instagram_dm`,
`twitter`, `linkedin`, `tiktok`, `snapchat`, `email`) or the family alias
`whatsapp`, which covers both WhatsApp flavours.

```ts
await client.channels.list({ type: 'telegram', status: 'connected' });
await client.channels.whatsapp('connected');
await client.channels.connected();

// Prune links whose QR was never scanned (needs `write`)
for await (const stale of client.channels.listAll({ status: 'awaiting_scan' })) {
  await client.channels.delete(stale.id);
}
```

### WhatsApp templates

Templates are how you open a conversation outside WhatsApp's 24-hour service
window. Only `APPROVED` templates can be sent.

```ts
const approved = await client.templates.list({ status: 'APPROVED', language: 'ar' });

await client.templates.send({
  channel_id: channelId,
  wa_id: '966500000000',
  template_name: 'order_ready',
  language: 'ar',
  variables: ['12345', '120 SAR'],   // fills {{1}}, {{2}}
});
```

### WhatsApp groups

Baileys channels only — Cloud API has no group-management surface.

```ts
const group = await client.groups.create('Sales pod', ['966500000000', '966500000001']);
await client.groups.addParticipants(group.id, ['966500000002']);
await client.groups.update(group.id, { subject: 'Renamed pod' });
await client.groups.sync(group.id);      // re-read the roster from WhatsApp
```

## Email

Send as one of your verified sending domains (DKIM-signed server-side), read the
send log, and manage templates, broadcasts and the suppression list.

```ts
const email = await client.emails.send(
  {
    from: 'Acme <hello@mail.acme.com>',
    to: ['ali@example.com'],
    subject: 'Your receipt',
    html: '<h1>Thanks!</h1>',
    text: 'Thanks!',                    // at least one of html / text / template
  },
  { idempotencyKey: 'order-1042-receipt' },
);

email.status;                            // queued | sent | delivered | bounced | complained | failed

// …or render a stored template
await client.emails.sendTemplate(
  'Acme <hello@mail.acme.com>',
  ['ali@example.com'],
  'order-receipt',
  { order_id: '1042' },
);

// Send log, one message, and deliverability analytics
await client.emails.list({ status: 'delivered', per_page: 50 });
await client.emails.get(emailId);
const stats = await client.emails.analytics({ from: '2026-06-01', to: '2026-06-30' });
stats.summary.delivery_rate;

// Templates, broadcasts, suppressions
const template = await client.emails.templates.create({
  name: 'Order receipt',
  subject: 'Your order {{ order_id }} is confirmed',
  html: '<p>Hi {{ name }}, order {{ order_id }} is on the way.</p>',
});

const broadcast = await client.emails.broadcasts.create({
  name: 'July newsletter',
  from: 'Acme <hello@mail.acme.com>',
  subject: "What's new in July",
  html: '<h1>Hello!</h1>',
  audience: { tag_slugs: ['newsletter'] },   // omit ⇒ everyone with an email
});
await client.emails.broadcasts.queue(broadcast.id);

await client.emails.suppressions.add('bounced@example.com');
await client.emails.suppressions.remove('bounced@example.com');
```

> **Bring your own SMTP.** A domain connected through your own provider
> (SES / Postmark / Resend) is usable immediately — your server authenticates
> the mail. Platform-managed domains publish SPF/DKIM/DMARC first.

### Designing a message in code

`HtmlMessageBuilder` emits email-client-safe HTML: table layout, inlined CSS,
600px centred card — the lowest common denominator that survives Gmail and
Outlook. It is RTL-first, matching the platform's Arabic default.

```ts
import { HtmlMessageBuilder } from '@getokta/okta-connect-sdk';

const message = HtmlMessageBuilder.make()          // make(false) ⇒ LTR
  .brandColor('#D6F85C')
  .logo('https://cdn.acme.com/logo.png')
  .preheader('طلبك في الطريق')                     // hidden inbox preview text
  .heading('شكراً لطلبك!')
  .paragraph('طلبك رقم 1042 قيد التجهيز الآن.')
  .button('تتبع الطلب', 'https://acme.com/orders/1042')
  .divider()
  .footer('© 2026 Acme');

// sendHtml accepts the builder directly, and a bare string recipient
await client.emails.sendHtml('Acme <hello@mail.acme.com>', 'ali@example.com', 'طلبك رقم 1042', message);
```

Every text input is HTML-escaped; `.html()` is the one escape hatch — never
pass untrusted input to it.

## Social publishing

Compose once and fan out to many platforms. Each target reports its own status,
permalink and failure reason.

```ts
const post = await client.socialPosts.schedule(
  'New drop is live! 🎉',
  [xChannelId, telegramChannelId],
  '2026-07-20T09:00:00+00:00',                      // omit ⇒ draft
  [{ url: 'https://cdn.acme.com/promo.jpg', type: 'image' }],
);

await client.socialPosts.draft('Behind the scenes…', [instagramChannelId]);

for (const target of (await client.socialPosts.get(post.id)).targets ?? []) {
  console.log(target.status, target.permalink);
}
```

## Campaigns, tickets, analytics

```ts
// Broadcast campaigns: create a draft, then queue it (queueing needs `send`)
const campaign = await client.campaigns.create({
  name: 'Ramadan promo',
  channel_id: channelId,
  template_id: templateId,
  audience_filter: { tag_slugs: ['vip'] },
});
await client.campaigns.queue(campaign.id);

// Support tickets
const ticket = await client.tickets.open({ subject: 'Order stuck', contact_id: contactId });
await client.tickets.transition(ticket.id, { stage_id: resolvedStageId });
await client.tickets.list({ status: 'open' });

// Aggregate analytics over a date range
const metrics = await client.analytics.metrics({ from: '2026-06-01', to: '2026-06-30' });
metrics.metrics['messages.inbound'];
await client.analytics.metric('messages.outbound');
```

## Pagination

Every `list()` returns a `Page`, which is iterable:

```ts
const page = await client.contacts.list({ per_page: 50 });

page.data;          // Contact[]
page.total;         // total across all pages
page.hasMore;       // is there a next page?
page.nextPage;      // the `page` value to request next

for (const contact of page) console.log(contact.name);
```

To walk every page, use `listAll()` — an async iterator that fetches lazily and
stops the moment you `break`:

```ts
for await (const contact of client.contacts.listAll({ search: '+966' })) {
  console.log(contact.name);
}
```

## Connecting an account (OAuth-style, one click)

The easy way to get a token for a user's workspace — no copy-pasted API keys.
There is no `client_secret` and no PKCE: the authorization code is one-time,
expires in five minutes, and is bound to your `redirect_uri`.

```ts
import { Connect, OktaConnect } from '@getokta/okta-connect-sdk';

const connect = new Connect('https://connect.getokta.io');
const redirectUri = 'https://crm.example.com/okta/callback';

// 1. Send the user to the consent screen — keep `state` in the session.
const state = Connect.generateState();
req.session.oktaState = state;

const url = connect.authorizationUrl({
  appName: 'My CRM',
  redirectUri,
  abilities: ['read', 'send'],
  state,
  logoUrl: 'https://cdn.my-crm.com/logo.png',   // optional, https only
});

// 2. On the callback, verify state and exchange the code in one call.
const token = await connect.handleCallback(req.query, redirectUri, req.session.oktaState);

// 3. You now have a ready-to-use token.
const client = new OktaConnect({ baseUrl, token: token.access_token });
token.abilities;    // what the user actually granted
```

`handleCallback` throws when the user denied consent (`?error=access_denied`),
when `state` doesn't match (CSRF), or when no code is present. Prefer it over
calling `exchange()` directly so those checks always run.

**Asking for more.** Send the user back through `authorizationUrl()` with the
fuller ability set — the consent screen flags what's new and the exchange
replaces the old, narrower grant.

**Disconnecting.** Your app can sever its own link; the token is revoked and the
workspace is notified via a `connection.revoked` webhook:

```ts
await client.revokeConnection();
```

The workspace can also unlink your app from its dashboard, firing the same event
with `source: "workspace"` — subscribe to it to react when access is pulled.

## Webhooks

Register subscriptions over the API instead of by hand. The signing `secret` is
returned **once** on create — store it immediately.

```ts
import { WebhookEvents } from '@getokta/okta-connect-sdk';

const hook = await client.webhooks.create({
  name: 'Lifecycle',
  url: 'https://example.test/hooks/okta',
  events: [WebhookEvents.MessageReceived, WebhookEvents.ChannelDeleted],
  // events: [WebhookEvents.All],   // or receive everything
});

await vault.put('okta-webhook-secret', hook.secret);
await client.webhooks.list();
await client.webhooks.delete(hook.id);
```

### Verifying deliveries

The platform signs the raw body and sends it in
`X-Okta-Signature: sha256=<hmac>`. Always verify before trusting a delivery —
anyone can POST to your endpoint.

```ts
import { parseWebhook, verifyWebhookSignature } from '@getokta/okta-connect-sdk';

const ok = verifyWebhookSignature(rawBody, req.header('X-Okta-Signature'), secret);

// …or verify + decode in one step
const hook = parseWebhook(rawBody, req.header('X-Okta-Signature'), secret);

switch (hook.event) {
  case WebhookEvents.MessageReceived:
    return handle(hook.payload.conversation?.id, hook.payload.message?.body);
  case WebhookEvents.ChannelDeleted:
    return teardown(hook.payload.channel_id);
}
```

> **Pass the raw body.** If your framework parsed it to an object and you
> re-serialise it, key order and whitespace drift and the HMAC will not match.
> In Express: `express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } })`.

### Routing

```ts
import { WebhookRouter, WebhookEvents } from '@getokta/okta-connect-sdk';

const router = new WebhookRouter(secret)              // verifies the signature
  .on(WebhookEvents.MessageReceived, (hook) => reply(hook.payload.conversation?.id))
  .onMessage((hook) => log(hook.payload.message?.status))   // any message.*
  .onChannel((hook) => sync(hook.payload.channel_id))
  .onSubscription((hook) => billing(hook.payload.status))
  .onAny((hook) => audit(hook));                            // fallback

app.post('/hooks/okta', async (req, res) => {
  await router.dispatch(req.rawBody, req.header('X-Okta-Signature'));
  res.sendStatus(200);
});
```

Every matching handler runs — exact event, then `family.*`, then `*` — and each
is awaited, so a rejected handler surfaces to your route and you can answer
non-2xx to have the platform retry.

### Events

| Family | Events |
|---|---|
| Messaging | `message.received` `message.sent` `message.delivered` `message.read` `message.failed` |
| Conversations | `conversation.opened` `conversation.assigned` `conversation.closed` |
| Channels | `channel.connected` `channel.disconnected` `channel.deleted` |
| Billing | `subscription.activated` `subscription.cancelled` `subscription.expired` `subscription.past_due` |
| Email | `email.delivered` `email.bounced` `email.complained` `email.opened` `email.clicked` |
| Apps | `connection.revoked` |

## Embedding the inbox

Mint operator tokens and build iframe URLs locally — no hand-rolled JWTs, no API
round-trip. Get the shared secret from your platform operator.

```ts
import { UiHide } from '@getokta/okta-connect-sdk';

const embed = client.embed(sharedSecret);         // base URL reused from the client
const operator = { sub: 'partner-user-7', email: 'op@acme.com', name: 'Op' };

// Cookieless per-request flow — survives third-party-cookie blocking.
// Recommended for white-label embeds.
const src = embed.inboxUrl(operator, { uiHide: [UiHide.AI, UiHide.ASSIGN_AGENT] });

// …or attach the token to your own fetch calls instead of the query string
const headers = embed.tokenHeader(embed.sessionToken(operator));

// One-shot SSO landing handshake (same-site cookies)
const ssoUrl = embed.ssoUrl(operator, '/app/inbox?embedded=1');
```

Unknown `ui_hide` keys and out-of-range TTLs throw at mint time, so a
misconfigured embed fails loudly here instead of silently in the browser.

Separately, `client.embedTokens.create()` mints **visitor** tokens for the
white-label chat widget (admin-only).

## Idempotency

Mutating calls accept an `Idempotency-Key` so a retry is server-deduped:

```ts
await client.messages.send(payload, { idempotencyKey: 'order-1234-confirmation' });
```

This also widens the SDK's own retry policy — see below.

## Configuration

| Option | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | `string` | `OKTA_CONNECT_BASE_URL` | Root URL of the deployment. |
| `token` | `string` | `OKTA_CONNECT_TOKEN` | Sanctum personal-access token. |
| `timeout` | `number` | `30000` | Per-request timeout, in ms. |
| `maxRetries` | `number` | `2` | Retry budget for retryable failures. `0` disables. |
| `retryBaseDelay` | `number` | `250` | Base backoff in ms; doubles per attempt. |
| `retryMaxDelay` | `number` | `8000` | Ceiling on a single backoff sleep, in ms. |
| `headers` | `object` | `{}` | Extra headers on every request. |
| `fetch` | `function` | global `fetch` | Custom transport (tests, proxies). |
| `userAgent` | `string` | — | Appended to the SDK's User-Agent. |
| `onRetry` | `function` | — | Called before each retry, for observability. |

Every method also takes per-call options: `idempotencyKey`, `signal`,
`timeout`, `headers`, `maxRetries`.

```ts
const controller = new AbortController();
await client.contacts.list({}, { signal: controller.signal, timeout: 5_000 });
```

### Retry policy

Deliberately narrower than "retry everything":

- **429** is always retried — the request was rejected before it was processed,
  so replaying it cannot double-apply a write. `Retry-After` is honoured.
- **5xx and network failures** are retried only when the request is safe to
  replay: an idempotent method (GET/PUT/DELETE), or any method carrying an
  `idempotencyKey`.
- A bare `POST` that fails mid-flight is **not** retried — the server may
  already have sent the message or email, and a blind replay would send it
  twice. Pass `idempotencyKey` to make such calls retryable.

Backoff is exponential with full jitter. A caller-triggered abort is never
retried.

## Error handling

Every non-2xx response raises a subclass of `OktaConnectError`:

| Error | HTTP | Meaning |
|---|---|---|
| `AuthenticationError` | 401 | Token missing, invalid, expired or revoked. |
| `AuthorizationError` | 403 | Token lacks the ability this endpoint needs. |
| `NotFoundError` | 404 | Resource doesn't exist, or isn't visible to this token. |
| `ConflictError` | 409 | Conflicts with the resource's current state. |
| `ValidationError` | 422 | Body failed validation — read `.errors`. |
| `RateLimitError` | 429 | Rate limit exceeded — back off by `.retryAfter`. |
| `ServerError` | 5xx | Server error, raised after the retry budget. |
| `ConnectionError` | — | DNS, TLS, socket, or a caller abort. |
| `TimeoutError` | — | Exceeded the configured timeout. |
| `InvalidArgumentError` | — | Bad SDK usage, caught before any request. |
| `WebhookSignatureError` | — | Inbound webhook failed verification. |

Each carries `status`, `body`, `json`, `headers`, `method`, `url`, `attempts`
and `requestId`.

```ts
import { RateLimitError, ValidationError } from '@getokta/okta-connect-sdk';

try {
  await client.messages.sendText(channelId, waId, 'Hello');
} catch (error) {
  if (error instanceof RateLimitError) {
    await sleep((error.retryAfter ?? 1) * 1000);
  } else if (error instanceof ValidationError) {
    console.error(error.fields, error.first('wa_id'));
  } else {
    throw error;
  }
}
```

## Escape hatch

For an endpoint the SDK doesn't wrap yet, use the transport directly — it keeps
auth, retries and error mapping:

```ts
const response = await client.http.get<{ data: unknown }>('/api/v1/something-new');
response.data;
```

## Field naming

Requests and responses keep the API's own `snake_case`; SDK-level options
(`idempotencyKey`, `maxRetries`, …) are `camelCase`. The rule: **anything that
travels on the wire keeps the API's naming, anything that configures the SDK is
camelCase** — so the types check directly against the platform's API docs.

## Development

```bash
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit (also compiles the README's examples)
npm run build     # tsup → dist/ (ESM + CJS + .d.ts)
npm run smoke     # load the built ESM + CJS bundles and assert the wiring
```

The suite runs on Node 20/22/24 — vitest itself requires Node 20+. Node 18
remains supported by the package, and CI proves it by building on Node 22 and
then running `npm run smoke` under Node 18, which is what a consumer on 18
actually does.

## License

MIT — see [LICENSE](LICENSE).
