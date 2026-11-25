import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";

import { AuditLogBuffer } from "../data-access/audit-log-buffer";
import type { TAuditLogEntryRecord } from "../models/audit-log-entry";
import { AuditLogRecorderService } from "../services/audit-log-recorder/service";
import type { TAuditLogIdGenerator } from "../services/dependencies";
import { FakeAuditLogMetrics } from "./fake-audit-log-metrics";

class SequentialIdGenerator implements TAuditLogIdGenerator {
  private count = 0;

  next() {
    this.count += 1;
    return `log-${this.count}`;
  }
}

// The real recorder over a buffer on an in-memory key store. `appended()` reads back what was recorded, in order.
export const buildAuditLog = ({ keyStore = new InMemoryKeyStore() }: { keyStore?: InMemoryKeyStore } = {}) => {
  const buffer = new AuditLogBuffer(keyStore);
  const metrics = new FakeAuditLogMetrics();
  const auditLogRecorderService = new AuditLogRecorderService(buffer, new SequentialIdGenerator(), metrics);

  const appended = async (): Promise<TAuditLogEntryRecord[]> => {
    const { entries } = await buffer.collect({ batchSize: 1000, maxEntries: 1000 });
    return entries.map((entry) => JSON.parse(entry.data) as TAuditLogEntryRecord);
  };

  return { auditLogRecorderService, buffer, keyStore, metrics, appended };
};
