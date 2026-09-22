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
    {
      sessionId,
      recordBudget,
      maxChunks,
      before,
      from,
      to
    }: {
      sessionId: string;
      recordBudget: number;
      maxChunks: number;
      before?: string;
      from?: Date;
      to?: Date;
    },
    tx?: Knex
  ): Promise<{ chunks: TAgentVaultActivityChunks[]; hasMore: boolean }> => {
    try {
      const query = (tx || db.replicaNode())(TableName.AgentVaultActivityChunk)
        .where({ sessionId })
        .orderBy("chunkId", "desc")
        // Chunks, not records, because a chunk is one encrypted object and cannot be split. The
        // budget is applied below; this is only a ceiling so a session of tiny chunks cannot make
        // one request walk the whole table.
        .limit(maxChunks);

      if (before) void query.andWhere("chunkId", "<", before);

      // An overlap test, not a containment one. A chunk spans [startedAt, endedAt], and chunks
      // interleave freely: two proxies serve one session, and one proxy draining a backlog seals
      // out of order. Matching on startedAt alone would drop a chunk that begins just before the
      // window and holds most of its records inside it.
      //
      // A filter, never the ordering. Ordering by startedAt while the cursor compares chunkId is
      // the exact bug the comment above describes, and it reads as the end of the session rather
      // than as a missing page.
      if (from) void query.andWhere("endedAt", ">=", from);
      if (to) void query.andWhere("startedAt", "<=", to);

      const rows = (await query) as TAgentVaultActivityChunks[];

      // Take whole chunks until the budget is met, so a page holds about the same number of
      // *records* whatever the agent's pace. Counting chunks instead hands a busy agent 15,000 rows
      // and a quiet one 15, off the same limit. The chunk that crosses the line is kept: dropping
      // it would leave a page short, and the next page starts after it either way.
      let taken = 0;
      const page: TAgentVaultActivityChunks[] = [];
      for (const row of rows) {
        page.push(row);
        taken += row.recordCount;
        if (taken >= recordBudget) break;
      }

      // Whether another page exists is decided here rather than by the caller comparing lengths:
      // with a budget, a short page can still be followed by more.
      return { chunks: page, hasMore: page.length < rows.length || rows.length === maxChunks };
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

  /**
   * When a record last landed in the project's *current* destination.
   *
   * Scoped to configVersion, not just the project: chunks written before a repoint live in a bucket
   * Infisical no longer reads, so counting them would report a fresh timestamp for a destination
   * that has recorded nothing. The read path scopes reachability the same way.
   */
  const lastRecordedAtForProject = async (
    projectId: string,
    configVersion: number,
    tx?: Knex
  ): Promise<Date | null> => {
    try {
      const row = await (tx || db.replicaNode())(TableName.AgentVaultActivityChunk)
        .where({ projectId, configVersion })
        .max<{ lastRecordedAt: Date | null }[]>("createdAt as lastRecordedAt")
        .first();
      return row?.lastRecordedAt ?? null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find last agent vault activity chunk time" });
    }
  };

  return { ...orm, findForSessionPage, countForSession, lastRecordedAtForProject };
};
