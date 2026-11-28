/* eslint-disable class-methods-use-this */
import { auditLogDroppedCounter, auditLogEnqueuedCounter } from "@app/lib/telemetry/metrics";

import type { TAuditLogDropReason, TAuditLogMetrics } from "../../services/dependencies";

export class OtelMetricsClient implements TAuditLogMetrics {
  recordEnqueued({ eventType, actorType }: { eventType: string; actorType: string }): void {
    auditLogEnqueuedCounter.add(1, { "audit_log.event_type": eventType, "audit_log.actor_type": actorType });
  }

  recordDropped({
    eventType,
    actorType,
    reason,
    orgId
  }: {
    eventType: string;
    actorType: string;
    reason: TAuditLogDropReason;
    orgId?: string;
  }): void {
    auditLogDroppedCounter.add(1, {
      "audit_log.event_type": eventType,
      "audit_log.actor_type": actorType,
      "audit_log.drop_reason": reason,
      ...(orgId ? { "infisical.organization.id": orgId } : {})
    });
  }
}
