/* eslint-disable class-methods-use-this */
import {
  recordEventOutboxExhaustedMetric,
  recordEventOutboxLagMetric,
  recordEventOutboxRejectedMetric,
  resolveCoreMeter
} from "@app/lib/telemetry/metrics";

import { EventRejectionReason } from "../../models/event-rejection";
import { EventOutboxStatus } from "../../models/outbox-entry";
import { TEventsMetrics, TOldestPendingAge } from "../../services/dependencies";

export class OtelMetricsClient implements TEventsMetrics {
  private oldestPending: TOldestPendingAge[] = [];

  constructor(private readonly isTelemetryEnabled: boolean) {}

  isEnabled(): boolean {
    return this.isTelemetryEnabled;
  }

  recordRejected(params: { eventType: string; reason: EventRejectionReason; consumer?: string }): void {
    recordEventOutboxRejectedMetric(params);
  }

  recordLag(params: { consumer: string; status: EventOutboxStatus; seconds: number }): void {
    recordEventOutboxLagMetric(params);
  }

  recordExhausted(params: { consumer: string; count: number }): void {
    recordEventOutboxExhaustedMetric(params);
  }

  // The gauge reports these until the next relay tick.
  recordOldestPending(ages: TOldestPendingAge[]): void {
    this.oldestPending = ages;
  }

  // Only the relay process registers it, nothing else refreshes the ages.
  registerOldestPendingGauge(): void {
    const gauge = resolveCoreMeter().createObservableGauge("infisical.event_outbox.oldest_pending_age", {
      description:
        "Age in seconds of the oldest undelivered outbox event, by consumer. Alarm when this exceeds a small multiple of the relay interval: it means events are being recorded but not delivered.",
      unit: "s"
    });
    gauge.addCallback((result) => {
      if (!this.isTelemetryEnabled) return;
      this.oldestPending.forEach(({ consumer, ageSeconds }) => {
        result.observe(ageSeconds, { "event_outbox.consumer": consumer });
      });
    });
  }
}
