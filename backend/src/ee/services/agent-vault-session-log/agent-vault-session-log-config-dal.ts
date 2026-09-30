import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultSessionLogConfigs } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAgentVaultSessionLogConfigDALFactory = ReturnType<typeof agentVaultSessionLogConfigDALFactory>;

export const agentVaultSessionLogConfigDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultSessionLogConfig);

  // Reads the primary: a replica still saying "off" just after session logs are turned back on would make every proxy
  // drop what it holds.
  const findByProjectIdFromPrimary = async (
    projectId: string,
    tx?: Knex
  ): Promise<TAgentVaultSessionLogConfigs | undefined> => {
    try {
      return await (tx || db)(TableName.AgentVaultSessionLogConfig).where({ projectId }).first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault session log config from primary" });
    }
  };

  // One UPDATE, never read-modify-write: its row lock is what keeps the ceiling check correct under load.
  const recordStoredChunk = async (id: string, tx?: Knex): Promise<number> => {
    try {
      const result = await (tx || db).raw<{ rows: { storedChunkCount: string }[] }>(
        `UPDATE ?? SET "storedChunkCount" = "storedChunkCount" + 1 WHERE "id" = ? RETURNING "storedChunkCount"`,
        [TableName.AgentVaultSessionLogConfig, id]
      );
      return Number(result.rows[0]?.storedChunkCount ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Record agent vault session log stored chunk" });
    }
  };

  return { ...orm, findByProjectIdFromPrimary, recordStoredChunk };
};
