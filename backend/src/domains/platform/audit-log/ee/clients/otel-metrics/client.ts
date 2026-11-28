/* eslint-disable class-methods-use-this */
import { auditLogPersistDurationHistogram } from "@app/lib/telemetry/metrics";

import type { TAuditLogIngestionMetrics, TAuditLogStorageBackend } from "../../services/dependencies";

export class OtelMetricsClient implements TAuditLogIngestionMetrics {
  recordPersisted({
    backend,
    outcome,
    seconds
  }: {
    backend: TAuditLogStorageBackend;
    outcome: "success" | "failure";
    seconds: number;
  }): void {
    auditLogPersistDurationHistogram.record(seconds, { "audit_log.backend": backend, outcome });
  }
}
