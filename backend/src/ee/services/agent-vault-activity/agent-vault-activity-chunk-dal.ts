import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultActivityChunks } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAgentVaultActivityChunkDALFactory = ReturnType<typeof agentVaultActivityChunkDALFactory>;

export const agentVaultActivityChunkDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultActivityChunk);

  /**
   * Newest first, ordered and cursored on the same column so a page can never skip a row.
   *
   * That column has to be chunkId rather than startedAt. A ULID is minted when a chunk is *sealed*,
   * while startedAt is its first record's timestamp, and the two orderings differ whenever a second
   * proxy serves the session or one proxy drains a backlog into several chunks. Ordering by startedAt
   * while filtering on chunkId would drop every row whose id sorts above the cursor but whose
   * startedAt sorts below it, and the short page would then read as the end of the session.
   *
   * Chunk order only decides which chunks land on which page: the viewer merges the records it opens
   * and sorts those by their own timestamps.
   *
   * `(sessionId, chunkId)` is the table's unique index, so this is an index-only walk.
   */
  const findForSessionPage = async (
    { sessionId, limit, before }: { sessionId: string; limit: number; before?: string },
    tx?: Knex
  ): Promise<TAgentVaultActivityChunks[]> => {
    try {
      const query = (tx || db.replicaNode())(TableName.AgentVaultActivityChunk)
        .where({ sessionId })
        .orderBy("chunkId", "desc")
        .limit(limit);

      if (before) void query.andWhere("chunkId", "<", before);

      return (await query) as TAgentVaultActivityChunks[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault activity chunks" });
    }
  };

  const countForSession = async (sessionId: string, tx?: Knex): Promise<number> => {
    try {
      const row = await (tx || db.replicaNode())(TableName.AgentVaultActivityChunk)
        .where({ sessionId })
        .count<{ count: string }[]>("* as count")
        .first();
      return Number(row?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count agent vault activity chunks" });
    }
  };

  return { ...orm, findForSessionPage, countForSession };
};
