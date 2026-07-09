import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TPamSessionEventChunksInsert } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TPamSessionEventChunkDALFactory = ReturnType<typeof pamSessionEventChunkDALFactory>;

export const pamSessionEventChunkDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamSessionEventChunk);

  const findAllBySessionId = async (sessionId: string, tx?: Knex) => {
    return (tx || db.replicaNode())(TableName.PamSessionEventChunk)
      .where("sessionId", sessionId)
      .orderBy("chunkIndex", "asc")
      .select("*");
  };

  const findBySessionIdPaginated = async (
    sessionId: string,
    { offset, limit }: { offset: number; limit: number },
    tx?: Knex
  ) => {
    return (tx || db.replicaNode())(TableName.PamSessionEventChunk)
      .where("sessionId", sessionId)
      .orderBy("chunkIndex", "asc")
      .offset(offset)
      .limit(limit)
      .select("*");
  };

  const findByChunkIndex = async (sessionId: string, chunkIndex: number, tx?: Knex) => {
    return (tx || db.replicaNode())(TableName.PamSessionEventChunk).where({ sessionId, chunkIndex }).first();
  };

  const insertIgnoreDuplicate = async (data: TPamSessionEventChunksInsert, tx?: Knex) => {
    await (tx || db)(TableName.PamSessionEventChunk).insert(data).onConflict(["sessionId", "chunkIndex"]).ignore();
  };

  const getNextChunkIndex = async (sessionId: string, tx?: Knex) => {
    const qb = tx || db;
    await qb.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`pam-session-chunk:${sessionId}`]);
    const row = await qb(TableName.PamSessionEventChunk).where({ sessionId }).max("chunkIndex as max").first();
    return Number((row as { max?: string | number | null } | undefined)?.max ?? -1) + 1;
  };

  return {
    ...orm,
    findAllBySessionId,
    findBySessionIdPaginated,
    findByChunkIndex,
    insertIgnoreDuplicate,
    getNextChunkIndex
  };
};
