import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAgentVaultSessionStatsDALFactory = ReturnType<typeof agentVaultSessionStatsDALFactory>;

export const agentVaultSessionStatsDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultSessionStats);

  // One statement, so concurrent chunks from several proxies add up rather than overwrite each other. A null
  // brokered count stays null, since NULL + n is NULL: the session's split is unknown from then on.
  const addChunkCounts = async (sessionId: string, counts: { requests: number; brokered: number | null }) => {
    try {
      await db(TableName.AgentVaultSessionStats)
        .insert({ sessionId, requests: counts.requests, brokered: counts.brokered })
        .onConflict("sessionId")
        .merge({
          requests: db.raw(`?? + excluded.requests`, [`${TableName.AgentVaultSessionStats}.requests`]),
          brokered: db.raw(`?? + excluded.brokered`, [`${TableName.AgentVaultSessionStats}.brokered`])
        } as never);
    } catch (error) {
      throw new DatabaseError({ error, name: "Add agent vault session chunk counts" });
    }
  };

  return { ...orm, addChunkCounts };
};
