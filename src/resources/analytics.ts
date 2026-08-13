import type { RequestOptions } from '../http/http-client.js';
import type { AnalyticsMetrics, AnalyticsMetricsParams } from '../types/resources.js';
import { Resource } from './resource.js';

/**
 * `/api/v1/analytics/metrics` — aggregate totals over a date range, across
 * conversations and social. Read-only; needs `read`.
 */
export class Analytics extends Resource {
  /**
   * Metric totals for a window. Both bounds are optional — the API defaults to
   * the last 30 days.
   *
   * ```ts
   * const m = await client.analytics.metrics({ from: '2026-06-01', to: '2026-06-30' });
   * m.metrics['messages.inbound']; // 120
   * ```
   */
  async metrics(
    params: AnalyticsMetricsParams = {},
    options?: RequestOptions,
  ): Promise<AnalyticsMetrics> {
    const result = await this.getOne<AnalyticsMetrics>(
      this.api('/analytics/metrics'),
      { ...params },
      options,
    );

    // Normalise the one field callers index into, so `metrics[key]` is always
    // safe even if the window produced no rows at all.
    return { ...result, metrics: result?.metrics ?? {} };
  }

  /** A single metric total, or `fallback` when the key is absent. */
  async metric(
    key: string,
    params: AnalyticsMetricsParams = {},
    fallback = 0,
    options?: RequestOptions,
  ): Promise<number> {
    const result = await this.metrics(params, options);

    return result.metrics[key] ?? fallback;
  }
}
