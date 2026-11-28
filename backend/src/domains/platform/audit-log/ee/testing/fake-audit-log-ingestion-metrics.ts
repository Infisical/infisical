import type { TAuditLogIngestionMetrics, TAuditLogStorageBackend } from "../services/dependencies";

export class FakeAuditLogIngestionMetrics implements TAuditLogIngestionMetrics {
  persisted: { backend: TAuditLogStorageBackend; outcome: "success" | "failure"; seconds: number }[] = [];

  recordPersisted = (params: { backend: TAuditLogStorageBackend; outcome: "success" | "failure"; seconds: number }) => {
    this.persisted.push(params);
  };
}
