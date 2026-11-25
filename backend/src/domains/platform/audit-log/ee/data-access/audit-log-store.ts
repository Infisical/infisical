import { TableName, type TAuditLogs } from "@app/db/schemas";
import type { TStoreConnection } from "@app/domains/lib/data-access";
import { DatabaseError } from "@app/lib/errors";
import { chunkArray } from "@app/lib/fn";

import type { TAuditLogStore } from "../services/dependencies";

const INSERT_CHUNK_SIZE = 1000;

export class AuditLogStore implements TAuditLogStore {
  constructor(private readonly connection: TStoreConnection) {}

  // Several statements for a big batch: run it in a transaction so a batch lands whole or not at all.
  async insertBatch(rows: TAuditLogs[]): Promise<void> {
    if (rows.length === 0) return;
    try {
      for (const chunk of chunkArray(rows, INSERT_CHUNK_SIZE)) {
        // eslint-disable-next-line no-await-in-loop
        await this.connection.writer()(TableName.AuditLog).insert(chunk).onConflict().ignore();
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "auditLogBulkInsert" });
    }
  }
}
