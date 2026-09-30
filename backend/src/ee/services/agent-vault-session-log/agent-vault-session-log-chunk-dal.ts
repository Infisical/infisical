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

  const sumRecentCounts = async (
    { sessionIds, windowMs }: { sessionIds: string[]; windowMs: number },
    tx?: Knex
  ): Promise<Map<string, { recordedCount: number; droppedCount: number }>> => {
    try {
      const conn = tx || db.replicaNode();
      const rows = (await conn(TableName.AgentVaultSessionLogChunk)
        .join(
          conn(TableName.AgentVaultSessionLogChunk)
            .whereIn("sessionId", sessionIds)
            .groupBy("sessionId")
            .select("sessionId", db.raw(`MAX("startedAt") AS "latestStartedAt"`))
            .as("latest"),
          "latest.sessionId",
          `${TableName.AgentVaultSessionLogChunk}.sessionId`
        )
        .whereIn(`${TableName.AgentVaultSessionLogChunk}.sessionId`, sessionIds)
        .whereRaw(`?? >= "latest"."latestStartedAt" - (? * interval '1 millisecond')`, [
          `${TableName.AgentVaultSessionLogChunk}.startedAt`,
          windowMs
        ])
        .groupBy(`${TableName.AgentVaultSessionLogChunk}.sessionId`)
        .select(
          `${TableName.AgentVaultSessionLogChunk}.sessionId`,
          db.raw(`SUM(??) AS "recordedCount"`, [`${TableName.AgentVaultSessionLogChunk}.recordCount`]),
          db.raw(`SUM(??) AS "droppedCount"`, [`${TableName.AgentVaultSessionLogChunk}.droppedCount`])
        )) as { sessionId: string; recordedCount: string; droppedCount: string }[];

      return new Map(
        rows.map((row) => [
          row.sessionId,
          { recordedCount: Number(row.recordedCount), droppedCount: Number(row.droppedCount) }
        ])
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Sum recent agent vault session log counts" });
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

  // Checks the destination in the same statement as the move, so a settings save that lands first isn't undone.
  const moveToDestinationIfCurrent = async (
    {
      id,
      projectId,
      bucket,
      keyPrefix,
      objectKey
    }: { id: string; projectId: string; bucket: string; keyPrefix: string | null; objectKey: string },
    tx?: Knex
  ): Promise<TAgentVaultSessionLogChunks | undefined> => {
    try {
      const result = await (tx || db).raw<{ rows: TAgentVaultSessionLogChunks[] }>(
        `UPDATE ?? SET "bucket" = ?, "objectKey" = ?
        WHERE "id" = ? AND EXISTS (
          SELECT 1 FROM ?? cfg WHERE cfg."projectId" = ? AND cfg."bucket" = ? AND cfg."keyPrefix" IS NOT DISTINCT FROM ?
        )
        RETURNING *`,
        [
          TableName.AgentVaultSessionLogChunk,
          bucket,
          objectKey,
          id,
          TableName.AgentVaultSessionLogConfig,
          projectId,
          bucket,
          keyPrefix
        ]
      );
      return result.rows[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "Move agent vault session log chunk" });
    }
  };

  return {
    ...orm,
    findForSessionPage,
    findReceivedForSession,
    sumRecentCounts,
    createIfAbsent,
    moveToDestinationIfCurrent
  };
};
