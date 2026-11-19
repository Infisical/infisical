import { EventRejectionReason } from "../models/event-rejection";
import { EventOutboxStatus } from "../models/outbox-entry";
import { TEventsMetrics, TOldestPendingAge } from "../services/dependencies";

export class FakeEventsMetrics implements TEventsMetrics {
  rejected: { eventType: string; reason: EventRejectionReason; consumer?: string }[] = [];

  lag: { consumer: string; status: EventOutboxStatus; seconds: number }[] = [];

  exhausted: { consumer: string; count: number }[] = [];

  oldestPending: TOldestPendingAge[] = [];

  constructor(private readonly enabled = false) {}

  isEnabled = () => this.enabled;

  recordRejected = (params: { eventType: string; reason: EventRejectionReason; consumer?: string }) => {
    this.rejected.push(params);
  };

  recordLag = (params: { consumer: string; status: EventOutboxStatus; seconds: number }) => {
    this.lag.push(params);
  };

  recordExhausted = (params: { consumer: string; count: number }) => {
    this.exhausted.push(params);
  };

  recordOldestPending = (ages: TOldestPendingAge[]) => {
    this.oldestPending = ages;
  };
}
