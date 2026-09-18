import { TAuditLogs } from "@app/db/schemas";

import { LogProvider } from "../audit-log-stream/audit-log-stream-enums";

export enum AuditLogStreamOutboxStatus {
  Pending = "pending",
  Processing = "processing",
  Retry = "retry",
  Delivered = "delivered"
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
  createdAt: Date;
  updatedAt: Date;
};

export type TAuditLogStreamFlushJobData = {
  streamId: string;
  orgId: string;
  provider: LogProvider;
};

export type TFailedStreamRow = {
  row: TAuditLogStreamOutboxRow;
  errorMessage: string;
};
