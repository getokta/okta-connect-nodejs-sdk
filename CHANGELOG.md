# Changelog

All notable changes to `@getokta/okta-connect-sdk` are documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-08-18

### Removed (security hardening) — BREAKING
- **Dropped `EmbedScope.ADMIN`.** The constant, and the mint defaults that
  pointed at it, produced embed JWTs carrying the platform-operator scope —
  a grant no consumer of a public package is entitled to. `EmbedScope.INBOX`
  is now the only scope this SDK mints and the default for `ssoToken()`,
  `ssoUrl()`, `sessionToken()` and `embedUrl()`; any other value throws
  `InvalidArgumentError`.
  - **Migration:** replace `EmbedScope.ADMIN` with `EmbedScope.INBOX`, or
    drop the `scope` option entirely.

### Changed
- Documentation no longer names platform-operator endpoints or abilities.
  Products that need to create workspaces, manage their users, mint workspace
  tokens or reserve channels use the **Partner API** (`/api/v1/partner/*`)
  with their own `client_id`/`client_secret` — see the platform's
  `docs/PARTNER_API.md`.

## [1.0.1] — 2026-08-15

No changes to the SDK's behaviour or API — this release exists to give both
registries an identical, reproducible `1.0.1` tarball, and to fold in the
packaging fixes below.

> **Note on 1.0.0:** it was published to GitHub Packages and to npm from two
> different commits, so the two registries hold different tarballs under the
> same version. 1.0.1 is published to both from a single run. Prefer 1.0.1.

### Added

- **Releases now publish to the public npm registry** as well as GitHub
  Packages, so `npm install @getokta/okta-connect-sdk` works with no `.npmrc`
  setup (GitHub Packages requires authentication even for public packages).
  Published with `--provenance`, which signs the package with a verifiable link
  back to the workflow run and commit that built it.
- The npm step is **gated on an `NPM_TOKEN` secret**: without it the release
  still completes to GitHub Packages and logs that npm was skipped, rather than
  failing.
- **Trusted publishing (OIDC) support.** With a trusted publisher configured on
  npm and the repository variable `NPM_TRUSTED_PUBLISHING=true`, releases
  publish with a short-lived credential minted from the workflow's own
  identity — no `NPM_TOKEN` to store, leak, or renew. The token path still
  works and takes precedence when the secret is present.
- A test asserting `VERSION` matches `package.json`, so the version stamped
  into the User-Agent can't silently drift from the released one.

### Fixed

- **npm publishes went to the wrong registry.** Pointing `setup-node` at GitHub
  Packages leaves a per-scope mapping (`@scope:registry=npm.pkg.github.com`)
  behind, and for a scoped package that mapping beats a later default-registry
  change — so the npm token was sent to GitHub Packages and 401'd. The publish
  step now writes its own project-level `.npmrc` (which outranks setup-node's
  user-level config) and fails loudly if the registry still resolves anywhere
  but npmjs.
- `.npmrc` is gitignored, so a local one can't be committed with a token in it.

### Changed

- **Every publishing step in the release workflow is now idempotent.** An
  existing GitHub Release, or a version already present on a registry, is
  reported and skipped instead of failing the run. Re-dispatching is now the
  supported way to finish a partial release — e.g. pushing an already-released
  version to npm once `NPM_TOKEN` is configured.

- **CI now proves Node 18 support by loading the built package there**, rather
  than by running the suite. Vitest 4 requires Node 20+, so the suite runs on
  Node 20/22/24 and a separate job builds on 22 and then executes
  `scripts/smoke.{mjs,cjs}` under Node 18. The package's supported runtimes are
  unchanged (`engines: >=18.17`) — the SDK has no runtime dependencies and needs
  only global `fetch` and `node:crypto`.
- Added `npm run smoke`: loads `dist/` the way a consumer does and asserts the
  wiring end to end (request shaping, typed errors, pagination, webhook
  verification and routing, embed JWT signature, escaping). It covers what the
  unit suite cannot — that the *shipped bundles*, ESM and CJS alike, work.

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
  runtime dependencies, and Node 18.17+. CI runs the suite on Node 20/22/24 and
  loads the built package under Node 18.

### Notes

- Request and response types keep the API's `snake_case`; only SDK-level options
  are `camelCase`.
- `contacts.upsert()` requires `wa_id` — the platform keys the upsert on
  `(organization, wa_id)`, so a payload with only `phone` is rejected with 422.
- Timeouts are enforced by the SDK itself rather than delegated to the
  transport, so a custom `fetch` that ignores its `AbortSignal` cannot hang the
  caller.
