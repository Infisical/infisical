import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { logger } from "@app/lib/logger";

import type { AuditLogEntry } from "../models/audit-log-entry";
import type { TAuditLogBuffer, TBufferedAuditLog } from "../services/dependencies";

// Frozen: old pods append to and drain the same stream, under the same lock, during a rolling deploy. The lock key
// is cast rather than imported because the key store module is in an import cycle with crypto.
const BufferKeys = {
  stream: "audit-log-stream",
  drainLock: "audit-log-ingest:consumer-lock"
};

// Long enough to outlive a slow drain; the fencing release keeps a late runner from freeing a successor's lock.
const DRAIN_LOCK_TTL_MS = 60_000;

export class AuditLogBuffer implements TAuditLogBuffer {
  constructor(private readonly keyStore: TDomainKeyStore) {}

  async append(entry: AuditLogEntry): Promise<void> {
    await this.keyStore.streamAdd(BufferKeys.stream, "*", { data: JSON.stringify(entry.toJSON()) });
  }

  async collect({ batchSize, maxEntries }: { batchSize: number; maxEntries: number }) {
    const { entries, lastId } = await this.keyStore.streamCollect(BufferKeys.stream, batchSize, maxEntries);
    return {
      entries: entries.map(([streamId, fields]): TBufferedAuditLog => ({ streamId, data: fields[1] })),
      lastStreamId: lastId
    };
  }

  async trimThrough(lastStreamId: string): Promise<void> {
    await this.keyStore.streamTrim(BufferKeys.stream, lastStreamId, true);
  }

  async whileHoldingDrainLock(work: () => Promise<void>): Promise<boolean> {
    let lock;
    try {
      lock = await this.keyStore.acquireLock([BufferKeys.drainLock], DRAIN_LOCK_TTL_MS, { retryCount: 0 });
    } catch {
      return false;
    }
    try {
      await work();
    } finally {
      await lock.release().catch((error: unknown) => {
        logger.warn(error, "audit-log: failed to release the drain lock; it expires on its own");
      });
    }
    return true;
  }
}
