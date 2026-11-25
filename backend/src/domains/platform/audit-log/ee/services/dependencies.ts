import type { TAuditLogs } from "@app/db/schemas";
import type { TStoreLocks } from "@app/domains/lib/transactions";

export type TAuditLogStorageBackend = "postgres" | "clickhouse";

// Where stored audit logs go: Postgres or ClickHouse. Inserts are idempotent on id, so a retried batch is safe.
export type TAuditLogWriter = {
  readonly backend: TAuditLogStorageBackend;
  insertBatch(rows: TAuditLogs[]): Promise<void>;
};

export type TAuditLogStore = {
  insertBatch(rows: TAuditLogs[]): Promise<void>;
};

export type TAuditLogStores = {
  auditLogStore: TAuditLogStore;
  locks: TStoreLocks;
};

// What another domain hands ingestion to receive every stored batch, such as the log streams. A failure leaves the
// batch in the buffer, so the next drain stores and delivers it again: deliver must be idempotent on the log id.
export type TAuditLogConsumer = {
  // For logs only.
  name: string;
  deliver(rows: TAuditLogs[]): Promise<void>;
};

export type TAuditLogIngestionMetrics = {
  recordPersisted(params: { backend: TAuditLogStorageBackend; outcome: "success" | "failure"; seconds: number }): void;
};
