import type { TAuditLogs } from "@app/db/schemas";

import type { TAuditLogStorageBackend, TAuditLogWriter } from "../services/dependencies";

// Holds rows by id, so a retried batch doesn't duplicate them, like the real writers.
export class InMemoryAuditLogWriter implements TAuditLogWriter {
  private readonly stored = new Map<string, TAuditLogs>();

  private failure: Error | null = null;

  insertCalls = 0;

  constructor(readonly backend: TAuditLogStorageBackend = "postgres") {}

  get rows(): TAuditLogs[] {
    return [...this.stored.values()];
  }

  failNextInsert(error = new Error("storage down")) {
    this.failure = error;
  }

  async insertBatch(rows: TAuditLogs[]): Promise<void> {
    this.insertCalls += 1;
    if (this.failure) {
      const error = this.failure;
      this.failure = null;
      throw error;
    }
    rows.forEach((row) => {
      if (!this.stored.has(row.id)) this.stored.set(row.id, row);
    });
  }
}
