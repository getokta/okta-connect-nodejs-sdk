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
 *    channel.
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

  /** Finalise a signup session; returns the channel(s) that were created. */
  async completeEmbeddedSignup(
    code: string,
    wabaId: string,
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
 * {@link start} creates the channel and boots a gateway session asynchronously;
 * then poll {@link status} every few seconds until the channel reports
 * `connected` (or a terminal failure).
 *
 * ```ts
 * const session = await client.qr.start('Sales line');
 * let state = await client.qr.status(session.id!);
 * while (state.status === 'awaiting_scan' || state.status === 'connecting') {
 *   await new Promise((r) => setTimeout(r, 3000));
 *   state = await client.qr.status(session.id!);
 * }
 * ```
 */
export class QrPairing extends Resource {
  /** Start a pairing session for a new channel. */
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
