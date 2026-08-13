# Changelog

All notable changes to `@getokta/okta-connect-sdk` are documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-08-13

First release. Full parity with the tenant surface of the Okta Connect public
API (`/api/v1`), mirroring the PHP SDK's coverage in idiomatic TypeScript.

### Added

- **`OktaConnect` client** — one entry point with lazy resource accessors, an
  `AbortSignal`-aware transport, and `baseUrl`/`token` fallbacks to
  `OKTA_CONNECT_BASE_URL` / `OKTA_CONNECT_TOKEN`.

- **Messaging** — `messages` (`sendText` / `sendMedia` / `reply` / raw `send`),
  `conversations` (list / get / messages), `contacts` (list / get / upsert /
  `applyTags`), `channels` (list / get / delete plus `whatsapp()`,
  `connected()`, `disconnected()`, `awaitingScan()` helpers), `templates`
  (catalogue + send), and `groups` (WhatsApp groups on Baileys channels).

- **Email** — `emails.send` / `sendHtml` / `sendTemplate`, the send log,
  deliverability `analytics()`, and nested `emails.templates`,
  `emails.broadcasts` and `emails.suppressions`.

- **Publishing & campaigns** — `socialPosts` (`schedule` / `draft`, with
  per-platform target outcomes) and `campaigns` (draft → queue).

- **Support & CRM** — `tickets` (open / transition / list), `tags`, and
  read-only `analytics.metrics()`.

- **Integrations** — `meta` (WhatsApp Embedded Signup driven from your own UI)
  and `qr` (QR pairing sessions).

- **Connect flow** — `Connect.authorizationUrl()`, `Connect.generateState()`,
  `handleCallback()` (denied-consent, CSRF `state` and missing-code checks) and
  `exchange()`. Plus `client.connection()`, `can()`, `missing()` and
  `revokeConnection()` for introspecting and severing a grant.

- **Embedded inbox** — `client.embed(secret)` mints HS256 tokens locally for
  both flows: the one-shot `/embed/sso` handshake (≤5 min) and the long-lived
  cookieless per-request token (≤4 h). `ui_hide` keys and TTL bounds are
  validated at mint time, so a misconfigured embed throws here instead of
  failing silently in the browser. `client.embedTokens` mints visitor tokens
  for the white-label chat widget.

- **Webhooks** — `verifyWebhookSignature()` (constant-time HMAC-SHA256),
  `parseWebhook()` (verify + decode), and a `WebhookRouter` with per-event,
  per-family (`onMessage` / `onChannel` / `onSubscription` / `onEmail`) and
  catch-all handlers. Handlers are awaited, so a rejection reaches your route
  and the platform retries.

- **`HtmlMessageBuilder`** — fluent, RTL-first builder emitting email-client-safe
  HTML (table layout, inlined CSS, 600px card). All text is escaped; `.html()`
  is the sole raw escape hatch.

- **Pagination** — every `list()` returns an iterable `Page` with `hasMore` /
  `nextPage` / `total`; every resource also exposes `listAll()`, an async
  iterator that walks pages lazily and stops when the caller breaks.

- **Typed errors** — `AuthenticationError`, `AuthorizationError`,
  `NotFoundError`, `ConflictError`, `ValidationError` (with `.errors`,
  `.fields`, `.first()`), `RateLimitError` (with `.retryAfter`), `ServerError`,
  `ConnectionError`, `TimeoutError`, `InvalidArgumentError` and
  `WebhookSignatureError`, all carrying `status`, `body`, `json`, `headers`,
  `method`, `url`, `attempts` and `requestId`.

- **Retries** — 429 is always retried (honouring `Retry-After`); 5xx and network
  failures are retried only for idempotent methods or requests carrying an
  `idempotencyKey`. A bare `POST` is never blindly replayed, since the message
  or email may already have gone out. Exponential backoff with full jitter, and
  an `onRetry` hook for observability.

- **Packaging** — dual ESM + CommonJS builds with generated `.d.ts`, zero
  runtime dependencies, Node 18.17+, and CI across Node 18/20/22/24.

### Notes

- Request and response types keep the API's `snake_case`; only SDK-level options
  are `camelCase`.
- `contacts.upsert()` requires `wa_id` — the platform keys the upsert on
  `(organization, wa_id)`, so a payload with only `phone` is rejected with 422.
- Timeouts are enforced by the SDK itself rather than delegated to the
  transport, so a custom `fetch` that ignores its `AbortSignal` cannot hang the
  caller.
