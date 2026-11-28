import type { TAuditLogDropReason, TAuditLogMetrics } from "../services/dependencies";

export class FakeAuditLogMetrics implements TAuditLogMetrics {
  enqueued: { eventType: string; actorType: string }[] = [];

  dropped: { eventType: string; actorType: string; reason: TAuditLogDropReason; orgId?: string }[] = [];

  recordEnqueued = (params: { eventType: string; actorType: string }) => {
    this.enqueued.push(params);
  };

  recordDropped = (params: { eventType: string; actorType: string; reason: TAuditLogDropReason; orgId?: string }) => {
    this.dropped.push(params);
  };
}
