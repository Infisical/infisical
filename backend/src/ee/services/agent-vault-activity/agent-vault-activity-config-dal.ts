import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAgentVaultActivityConfigDALFactory = ReturnType<typeof agentVaultActivityConfigDALFactory>;

export const agentVaultActivityConfigDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultActivityConfig);

  /**
   * Counts a stored chunk and stamps when it landed, returning the new total. The UPDATE takes the config
   * row's lock, so concurrent chunk inserts serialise and each caller reads its own true total: this is
   * what makes the ceiling check correct under load. Never read-modify-write here.
   *
   * The stamp is only for the current destination. A chunk that raced a repoint under the previous
   * configVersion landed in a bucket this row no longer points at, and must not report it as working.
   */
  const recordStoredChunk = async (
    { id, configVersion }: { id: string; configVersion: number },
    tx?: Knex
  ): Promise<number> => {
    try {
      const result = await (tx || db).raw<{ rows: { storedChunkCount: string }[] }>(
        `UPDATE ?? SET "storedChunkCount" = "storedChunkCount" + 1,
           "lastRecordedAt" = CASE WHEN "configVersion" = ? THEN now() ELSE "lastRecordedAt" END
         WHERE "id" = ? RETURNING "storedChunkCount"`,
        [TableName.AgentVaultActivityConfig, configVersion, id]
      );
      return Number(result.rows[0]?.storedChunkCount ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Record agent vault activity stored chunk" });
    }
  };

  return { ...orm, recordStoredChunk };
};
