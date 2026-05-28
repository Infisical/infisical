import { TAuditLogs } from "@app/db/schemas";

import { LogProvider } from "../audit-log-stream/audit-log-stream-enums";

export enum AuditLogStreamOutboxStatus {
  Pending = "pending",
  Processing = "processing",
  Retry = "retry"
}

export type TAuditLogStreamOutboxRow = {
  id: number;
  streamId: string;
  orgId: string;
  auditLogId: string;
  payload: TAuditLogs;
  status: AuditLogStreamOutboxStatus;
  attempts: number;
  nextRetryAt: Date;
  lockedAt: Date | null;
  workerId: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TAuditLogStreamFlushJobData = {
  streamId: string;
  orgId: string;
  provider: LogProvider;
};

// Pairs an outbox row with the error its chunk hit during delivery. Different
// chunks of one claim can fail with different errors, so the worker collects
// these and the DAL groups by message when writing back to retry / DLQ.
export type TFailedStreamRow = {
  row: TAuditLogStreamOutboxRow;
  errorMessage: string;
};
