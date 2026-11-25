import type { TAuditLogs } from "@app/db/schemas";
import type { TAuditLogEntryRecord } from "@app/domains/platform/audit-log/ce/module";
import { logger } from "@app/lib/logger";
import { sanitizeLogPayload, sanitizeLogText } from "@app/lib/validator/log-safe-text";

import type { TAuditLogStorageBackend } from "../dependencies";

const normalizeJsonPayload = (payload: unknown) => {
  if (Array.isArray(payload)) return { data: payload };
  if (typeof payload === "object" && payload !== null) return payload;
  logger.error({ payload }, "audit-log: unexpected audit log payload type, expected object or array");
  return {};
};

// ClickHouse columns are non-nullable strings, so an empty value is "" there and null in Postgres.
const normalizeEmptyValue = (value: string | undefined | null, backend: TAuditLogStorageBackend) => {
  if (!value) return backend === "clickhouse" ? "" : null;
  return value;
};

// One buffered entry as a storage row. null for an entry that can't be stored: not an object, or missing the org or
// expiry (written by a pod from before both were resolved when recording).
export const toAuditLogRow = (raw: unknown, backend: TAuditLogStorageBackend): TAuditLogs | null => {
  if (typeof raw !== "object" || raw === null) {
    logger.error("audit-log: skipping non-object audit log buffer entry");
    return null;
  }
  const entry = raw as TAuditLogEntryRecord;
  if (!entry.orgId || !entry.expiresAt) {
    logger.error(
      `audit-log: skipping entry missing resolved metadata [event=${entry.event?.type}] [orgId=${entry.orgId}]`
    );
    return null;
  }

  const createdAt = new Date(entry.createdAt);
  // Sanitized here because the row feeds both storage and the consumers.
  return {
    id: entry.id,
    actor: entry.actor.type,
    actorMetadata: sanitizeLogPayload(normalizeJsonPayload(entry.actor.metadata)),
    ipAddress: normalizeEmptyValue(sanitizeLogText(entry.ipAddress), backend),
    eventType: entry.event.type,
    eventMetadata: sanitizeLogPayload(normalizeJsonPayload((entry.event as { metadata?: unknown }).metadata)),
    userAgent: normalizeEmptyValue(sanitizeLogText(entry.userAgent), backend),
    userAgentType: normalizeEmptyValue(entry.userAgentType, backend),
    projectId: normalizeEmptyValue(entry.projectId, backend),
    orgId: entry.orgId,
    expiresAt: new Date(entry.expiresAt),
    createdAt,
    updatedAt: createdAt,
    // ClickHouse has no projectName column.
    ...(backend === "postgres" ? { projectName: sanitizeLogText(entry.projectName) } : {})
  };
};
