import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAgentVaultSessionLogChunks, TAgentVaultSessionLogChunksInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TAgentVaultSessionLogChunkDALFactory = ReturnType<typeof agentVaultSessionLogChunkDALFactory>;

export const agentVaultSessionLogChunkDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentVaultSessionLogChunk);

  // Ordered and cursored on chunkId, never startedAt: proxies seal out of order, so mixing the two skips rows.
  const findForSessionPage = async (
    {
      sessionId,
      recordBudget,
      byteBudget,
      maxChunks,
      before,
      from,
      to
    }: {
      sessionId: string;
      recordBudget: number;
      byteBudget: number;
      maxChunks: number;
      before?: string;
      from?: Date;
      to?: Date;
    },
    tx?: Knex
  ): Promise<{ chunks: TAgentVaultSessionLogChunks[]; hasMore: boolean }> => {
    try {
      const query = (tx || db.replicaNode())(TableName.AgentVaultSessionLogChunk)
        .where({ sessionId })
        .orderBy("chunkId", "desc")
        .limit(maxChunks);

      if (before) void query.andWhere("chunkId", "<", before);

      if (from) void query.andWhere("endedAt", ">=", from);
      if (to) void query.andWhere("startedAt", "<=", to);

      const rows = (await query) as TAgentVaultSessionLogChunks[];

      let taken = 0;
      let bytes = 0;
      const page: TAgentVaultSessionLogChunks[] = [];
      for (const row of rows) {
        page.push(row);
        taken += row.recordCount;
        bytes += row.ciphertextBytes;
        if (taken >= recordBudget || bytes >= byteBudget) break;
      }

      return { chunks: page, hasMore: page.length < rows.length || rows.length === maxChunks };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent vault session log chunks" });
    }
  };

  const findReceivedForSession = async (
    {
      sessionId,
      receivedAfter,
      recordBudget,
      byteBudget,
      maxChunks
    }: { sessionId: string; receivedAfter: Date; recordBudget: number; byteBudget: number; maxChunks: number },
    tx?: Knex
  ): Promise<{ chunks: TAgentVaultSessionLogChunks[]; hasMore: boolean }> => {
    try {
      const rows = (await (tx || db.replicaNode())(TableName.AgentVaultSessionLogChunk)
        .where({ sessionId })
        .andWhere("createdAt", ">=", receivedAfter)
        .orderBy([
          { column: "createdAt", order: "asc" },
          { column: "chunkId", order: "asc" }
        ])
        .limit(maxChunks)) as TAgentVaultSessionLogChunks[];

      let taken = 0;
      let bytes = 0;
      const page: TAgentVaultSessionLogChunks[] = [];
      for (const row of rows) {
        page.push(row);
        // The chunk exactly at receivedAfter resends the last read's; counting it could stall paging forever.
        if (row.createdAt.getTime() > receivedAfter.getTime()) {
          taken += row.recordCount;
          bytes += row.ciphertextBytes;
        }
        if (taken >= recordBudget || bytes >= byteBudget) break;
      }

      return { chunks: page, hasMore: page.length < rows.length || rows.length === maxChunks };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find received agent vault session log chunks" });
    }
  };

  const createIfAbsent = async (
    values: TAgentVaultSessionLogChunksInsert,
    tx?: Knex
  ): Promise<TAgentVaultSessionLogChunks | undefined> => {
    try {
      const [row] = (await (tx || db)(TableName.AgentVaultSessionLogChunk)
        .insert(values)
        .onConflict(["sessionId", "chunkId"])
        .ignore()
        .returning("*")) as TAgentVaultSessionLogChunks[];
      return row;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create agent vault session log chunk" });
    }
  };

  return { ...orm, findForSessionPage, findReceivedForSession, createIfAbsent };
};
