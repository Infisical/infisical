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
