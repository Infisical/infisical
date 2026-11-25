import type { TAuditLogs } from "@app/db/schemas";
import type { TAuditLogBuffer } from "@app/domains/platform/audit-log/ce/module";
import { logger } from "@app/lib/logger";

import type { TAuditLogConsumer, TAuditLogIngestionMetrics, TAuditLogWriter } from "../dependencies";
import { toAuditLogRow } from "../helpers/to-row";

const BATCH_SIZE = 10_000;
// Past this the buffer is backing up and Redis' MAXLEN cap risks dropping the oldest entries.
const MAX_ENTRIES_PER_DRAIN = 50_000;

export type TAuditLogIngestionService = {
  // Stores what's in the buffer, hands it to the consumers, then trims it. A failed store or delivery leaves the
  // buffer as it was, so the next drain retries the same batch; both are idempotent on the log id.
  drain(): Promise<void>;
};

export class AuditLogIngestionService implements TAuditLogIngestionService {
  constructor(
    private readonly auditLogBuffer: TAuditLogBuffer,
    private readonly writer: TAuditLogWriter,
    private readonly consumers: () => readonly TAuditLogConsumer[],
    private readonly metrics: TAuditLogIngestionMetrics
  ) {}

  async drain(): Promise<void> {
    // Another pod draining is not an error: the next tick picks up what's left.
    await this.auditLogBuffer.whileHoldingDrainLock(() => this.drainOnce());
  }

  private async drainOnce(): Promise<void> {
    const { entries, lastStreamId } = await this.auditLogBuffer.collect({
      batchSize: BATCH_SIZE,
      maxEntries: MAX_ENTRIES_PER_DRAIN
    });
    if (entries.length === 0 || !lastStreamId) return;
    if (entries.length >= MAX_ENTRIES_PER_DRAIN) {
      logger.warn(
        `audit-log: buffer backlog hit the collection ceiling [collected=${entries.length}] [maxEntries=${MAX_ENTRIES_PER_DRAIN}]; the oldest entries risk being dropped by the Redis MAXLEN cap`
      );
    }

    const rows = this.toRows(entries.map((entry) => entry.data));
    if (rows.length > 0) {
      if (!(await this.store(rows))) return;
      if (!(await this.deliver(rows))) return;
      logger.info(
        { inserted: rows.length, dropped: entries.length - rows.length, backend: this.writer.backend },
        "audit-log: batch processed audit logs"
      );
    }
    // Also when every entry was skipped, so they don't pile up.
    await this.auditLogBuffer.trimThrough(lastStreamId);
  }

  // One corrupt entry is skipped, never allowed to sink the batch.
  private toRows(data: string[]): TAuditLogs[] {
    const rows: TAuditLogs[] = [];
    for (const raw of data) {
      try {
        const row = toAuditLogRow(JSON.parse(raw), this.writer.backend);
        if (row) rows.push(row);
      } catch (error) {
        logger.error(error, "audit-log: skipping unreadable audit log buffer entry");
      }
    }
    return rows;
  }

  private async store(rows: TAuditLogs[]): Promise<boolean> {
    const startedAt = Date.now();
    try {
      await this.writer.insertBatch(rows);
    } catch (error) {
      this.metrics.recordPersisted({
        backend: this.writer.backend,
        outcome: "failure",
        seconds: (Date.now() - startedAt) / 1000
      });
      logger.error(error, `audit-log: failed to store ${rows.length} audit logs [backend=${this.writer.backend}]`);
      return false;
    }
    this.metrics.recordPersisted({
      backend: this.writer.backend,
      outcome: "success",
      seconds: (Date.now() - startedAt) / 1000
    });
    return true;
  }

  private async deliver(rows: TAuditLogs[]): Promise<boolean> {
    for (const consumer of this.consumers()) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await consumer.deliver(rows);
      } catch (error) {
        logger.error(
          error,
          `audit-log: consumer failed to take the batch; leaving the buffer untrimmed so it is retried [consumer=${consumer.name}]`
        );
        return false;
      }
    }
    return true;
  }
}
