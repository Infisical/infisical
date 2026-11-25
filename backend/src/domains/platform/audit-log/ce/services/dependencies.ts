import type { AuditLogEntry } from "../models/audit-log-entry";

// One raw entry read back from the buffer: its stream id and the JSON it was appended as.
export type TBufferedAuditLog = { streamId: string; data: string };

// The Redis stream every pod appends audit logs to and the ingestion processor drains.
export type TAuditLogBuffer = {
  append(entry: AuditLogEntry): Promise<void>;
  collect(input: { batchSize: number; maxEntries: number }): Promise<{
    entries: TBufferedAuditLog[];
    lastStreamId: string | null;
  }>;
  // Drops every entry up to and including lastStreamId.
  trimThrough(lastStreamId: string): Promise<void>;
  // Runs work only if no other pod is draining; returns false when it skipped.
  whileHoldingDrainLock(work: () => Promise<void>): Promise<boolean>;
};

export type TAuditLogDropReason = "ingest_stream_push_failed" | "recording_refused";

export type TAuditLogMetrics = {
  recordEnqueued(params: { eventType: string; actorType: string }): void;
  recordDropped(params: { eventType: string; actorType: string; reason: TAuditLogDropReason; orgId?: string }): void;
};

export type TAuditLogIdGenerator = {
  next(createdAt: Date): string;
};
