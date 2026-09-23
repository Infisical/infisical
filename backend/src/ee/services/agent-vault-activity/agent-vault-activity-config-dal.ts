import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAgentVaultActivityConfigDALFactory = ReturnType<typeof agentVaultActivityConfigDALFactory>;

export const agentVaultActivityConfigDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultActivityConfig);

  /**
   * Counts a stored chunk's records and stamps when it landed, returning the new total. The UPDATE takes
   * the config row's lock, so concurrent chunk inserts serialise and each caller reads its own true total:
   * this is what makes the ceiling check correct under load. Never read-modify-write here.
   *
   * The stamp is only for the current destination. A chunk that raced a repoint under the previous
   * configVersion landed in a bucket this row no longer points at, and must not report it as working.
   */
  const recordStoredChunk = async (
    { id, recordCount, configVersion }: { id: string; recordCount: number; configVersion: number },
    tx?: Knex
  ): Promise<number> => {
    try {
      const result = await (tx || db).raw<{ rows: { storedRecordCount: string }[] }>(
        `UPDATE ?? SET "storedRecordCount" = "storedRecordCount" + ?,
           "lastRecordedAt" = CASE WHEN "configVersion" = ? THEN now() ELSE "lastRecordedAt" END
         WHERE "id" = ? RETURNING "storedRecordCount"`,
        [TableName.AgentVaultActivityConfig, recordCount, configVersion, id]
      );
      return Number(result.rows[0]?.storedRecordCount ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Record agent vault activity stored chunk" });
    }
  };

  /** GREATEST floors at zero: a config row edited between a chunk write and the sweep must not go negative. */
  const decrementStoredRecordCount = async (id: string, delta: number, tx?: Knex): Promise<number> => {
    try {
      const result = await (tx || db).raw<{ rows: { storedRecordCount: string }[] }>(
        `UPDATE ?? SET "storedRecordCount" = GREATEST("storedRecordCount" - ?, 0) WHERE "id" = ? RETURNING "storedRecordCount"`,
        [TableName.AgentVaultActivityConfig, delta, id]
      );
      return Number(result.rows[0]?.storedRecordCount ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Decrement agent vault activity stored record count" });
    }
  };

  return { ...orm, recordStoredChunk, decrementStoredRecordCount };
};
