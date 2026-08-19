import { describe, expect, it } from 'vitest';
import { isRetryableQrSession, isTerminalQrSession, qrTtlSeconds } from '../src/index.js';
import type { QrSession } from '../src/types/resources.js';

/**
 * The pairing payload's `error` field, which is what turns "stuck at pending"
 * from a mystery into a decision.
 */
describe('QR session state', () => {
  it('keeps polling while nothing has gone wrong', () => {
    const session: QrSession = { id: 'ch_1', status: 'awaiting_scan', qr: '2@abc', error: null };

    expect(isTerminalQrSession(session)).toBe(false);
    expect(isRetryableQrSession(session)).toBe(false);
  });

  it('treats an expired code as terminal so the poll loop ends', () => {
    // Left out of the terminal set, a loop waits forever on a code the gateway
    // has stopped regenerating.
    expect(isTerminalQrSession({ status: 'qr_expired', error: 'qr_expired' })).toBe(true);
    expect(isRetryableQrSession({ status: 'qr_expired', error: 'qr_expired' })).toBe(false);
  });

  it('treats an unreachable gateway as the one error worth retrying', () => {
    const session: QrSession = { status: 'pending', error: 'gateway_unavailable' };

    expect(isRetryableQrSession(session)).toBe(true);
    expect(isTerminalQrSession(session)).toBe(false);
  });

  it('reads the TTL from either key name the platform emits', () => {
    expect(qrTtlSeconds({ qr_ttl_seconds: 55 })).toBe(55);
    expect(qrTtlSeconds({ expires_in: 60 })).toBe(60);
    expect(qrTtlSeconds({})).toBeNull();
  });
});
