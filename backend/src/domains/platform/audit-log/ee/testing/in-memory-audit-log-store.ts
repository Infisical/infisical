import type { TAuditLogs } from "@app/db/schemas";
import { InMemoryTransactionRunner } from "@app/domains/lib/transactions/testing/in-memory-transaction-runner";

import type { TAuditLogStore, TAuditLogStores } from "../services/dependencies";

// Holds rows by id, so a retried batch doesn't duplicate them, like the Postgres store.
export class InMemoryAuditLogStore implements TAuditLogStore {
  private rowsById = new Map<string, TAuditLogs>();

  get rows(): TAuditLogs[] {
    return [...this.rowsById.values()];
  }

  async insertBatch(rows: TAuditLogs[]): Promise<void> {
    rows.forEach((row) => {
      if (!this.rowsById.has(row.id)) this.rowsById.set(row.id, row);
    });
  }

  snapshot() {
    return new Map(this.rowsById);
  }

  restore(snapshot: unknown) {
    this.rowsById = new Map(snapshot as Map<string, TAuditLogs>);
  }
}

export const buildInMemoryAuditLogTransactions = () => {
  const auditLogStore = new InMemoryAuditLogStore();
  const transactionRunner = new InMemoryTransactionRunner<TAuditLogStores>(auditLogStore, (locks) => ({
    auditLogStore,
    locks
  }));
  return { auditLogStore, transactionRunner };
};
