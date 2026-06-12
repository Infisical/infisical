import { TAuditLogs } from "@app/db/schemas";

import { TAuditLogStreamOutboxRow } from "../audit-log-stream-outbox/audit-log-stream-outbox-types";
import { TLogStreamFactoryProviderBatchLimit } from "./audit-log-stream-types";

const sizeOf = (log: TAuditLogs): number => Buffer.byteLength(JSON.stringify(log), "utf8");

export const chunkAuditLogsByBatchLimit = (
  auditLogs: TAuditLogStreamOutboxRow[],
  limit: TLogStreamFactoryProviderBatchLimit
): TAuditLogStreamOutboxRow[][] => {
  if (auditLogs.length === 0) return [];

  const chunks: TAuditLogStreamOutboxRow[][] = [];
  let current: TAuditLogStreamOutboxRow[] = [];
  let currentBytes = 0;

  for (const log of auditLogs) {
    const logBytes = sizeOf(log.payload);

    if (logBytes > limit.maxBytes) {
      if (current.length > 0) {
        chunks.push(current);
        current = [];
        currentBytes = 0;
      }
      chunks.push([log]);
    } else {
      const wouldExceedCount = current.length + 1 > limit.maxLogs;
      const wouldExceedBytes = currentBytes + logBytes > limit.maxBytes;
      if (wouldExceedCount || wouldExceedBytes) {
        chunks.push(current);
        current = [log];
        currentBytes = logBytes;
      } else {
        current.push(log);
        currentBytes += logBytes;
      }
    }
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
};
