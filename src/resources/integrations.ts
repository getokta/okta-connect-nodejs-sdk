import type { RequestOptions } from '../http/http-client.js';
import type { Ulid } from '../types/common.js';
import type { EmbeddedSignupChannel, MetaConfig, QrSession } from '../types/resources.js';
import { Resource } from './resource.js';

/**
 * `/api/integrations/meta/*` — WhatsApp Embedded Signup, driven natively from
 * your own UI (no platform iframe).
 *
 * The flow runs in the browser:
 *
 * 1. Call {@link config} to learn which Meta app + signup config to use.
 * 2. Load Meta's JS SDK, init `FB` with `app_id` + `graph_version`, and render
 *    your own "Connect WhatsApp" button.
 * 3. On click, `FB.login(cb, { config_id, response_type: 'code', ... })`. Meta
 *    posts a `WA_EMBEDDED_SIGNUP` message back with `waba_id`, and the login
 *    callback yields a one-shot `code`.
 * 4. Call {@link completeEmbeddedSignup} with both; the platform exchanges the
 *    code for a system-user token, registers the number, and creates the
 *    channel. Missed the postMessage? Call it with the code alone — the
 *    platform reads the WABA id off the exchanged token.
 *
 * Note these endpoints sit under `/api/integrations`, not `/api/v1`.
 */
export class Meta extends Resource {
  /** Meta JS SDK parameters the browser step needs. */
  config(options?: RequestOptions): Promise<MetaConfig> {
    return this.http
      .get<MetaConfig>('/api/integrations/meta/config', undefined, options)
      .then((response) => response.data);
  }

  /**
   * Finalise a signup session; returns the channel(s) that were created.
   *
   * `wabaId` comes from Meta's `WA_EMBEDDED_SIGNUP` postMessage — delivered to
   * the browser once, with no second chance: a blocked frame, a restored tab,
   * or a completion event name Meta added later loses it permanently. Since
   * platform 2026-08 you may omit it in that case: the platform derives the
   * WABA id from the exchanged token itself instead of failing a signup the
   * operator already completed. Pass it when you have it — that skips the
   * extra lookup.
   */
  async completeEmbeddedSignup(
    code: string,
    wabaId = '',
    options?: RequestOptions,
  ): Promise<EmbeddedSignupChannel[]> {
    const response = await this.http.post<{ channels?: EmbeddedSignupChannel[] }>(
      '/api/integrations/meta/embedded-signup',
      { code, waba_id: wabaId },
      options,
    );

    return Array.isArray(response.data?.channels) ? response.data.channels : [];
  }
}

/**
 * `/api/integrations/qr/*` — QR pairing, the companion to Embedded Signup for
 * businesses without a Cloud API setup.
 *
 * The gateway session is booted **inside** the {@link start} request, so a
 * resolved promise means the gateway accepted the boot — not that a code
 * exists yet. A gateway that refuses rejects with `502 gateway_unavailable`
 * instead of handing back a row that would sit at `pending` forever.
 *
 * Poll every 2–3 seconds and branch on `error`, not on elapsed time — see
 * {@link isTerminalQrSession} and {@link isRetryableQrSession}. A session
 * whose row never left `pending` is re-booted by the poll itself, so a channel
 * stranded by an earlier failure heals without a new session.
 *
 * ```ts
 * let state = await client.qr.start('Sales line');
 *
 * while (!isTerminalQrSession(state)) {
 *   await new Promise((r) => setTimeout(r, 3000));
 *   state = await client.qr.status(state.id!);
 *
 *   // gateway_unavailable recovers; anything else needs a NEW session.
 *   if (state.error && !isRetryableQrSession(state)) break;
 * }
 * ```
 */
export class QrPairing extends Resource {
  /**
   * Start a pairing session for a new channel.
   *
   * Rejects with `422 channel_type_unavailable` when the operator has not
   * enabled the `baileys` channel type for this workspace — an availability
   * switch, not a billing one: no plan or paid subscription is involved.
   */
  start(displayName: string, options?: RequestOptions): Promise<QrSession> {
    return this.http
      .post<QrSession>(
        '/api/integrations/qr/sessions',
        { display_name: displayName },
        options,
      )
      .then((response) => response.data);
  }

  /** Poll a pairing session for the live QR string and connection status. */
  status(id: Ulid, options?: RequestOptions): Promise<QrSession> {
    return this.http
      .get<QrSession>(`/api/integrations/qr/sessions/${this.encode(id)}`, undefined, options)
      .then((response) => response.data);
  }
}

/** Statuses a pairing attempt does not come back from. */
const TERMINAL_QR_STATUSES: readonly string[] = [
  'connected',
  'disconnected',
  'failed',
  'qr_expired',
];

/**
 * Stop polling.
 *
 * `qr_expired` belongs here: the gateway has stopped regenerating the code, so
 * a loop that kept waiting on it would never end.
 */
export function isTerminalQrSession(session: QrSession): boolean {
  return TERMINAL_QR_STATUSES.includes(String(session.status ?? ''));
}

/**
 * Whether the failure is worth another poll at all. A gateway that is merely
 * unreachable recovers; a session whose code expired or whose boot failed
 * needs a NEW session, not more polling of this one.
 */
export function isRetryableQrSession(session: QrSession): boolean {
  return session.error === 'gateway_unavailable';
}

/** The live QR TTL, from whichever key name the platform used. */
export function qrTtlSeconds(session: QrSession): number | null {
  return session.qr_ttl_seconds ?? session.expires_in ?? null;
}
