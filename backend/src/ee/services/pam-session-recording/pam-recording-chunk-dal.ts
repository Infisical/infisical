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

  // Reads back from the primary: a replica may not have the row a retried upload is racing against yet
  const insertOrGetExisting = async (data: TPamSessionEventChunksInsert, tx?: Knex) => {
    const [inserted] = await (tx || db)(TableName.PamSessionEventChunk)
      .insert(data)
      .onConflict(["sessionId", "chunkIndex"])
      .ignore()
      .returning("*");
    if (inserted) return { inserted: true as const, chunk: inserted };

    const existing = await (tx || db)(TableName.PamSessionEventChunk)
      .where({ sessionId: data.sessionId, chunkIndex: data.chunkIndex })
      .first();
    return { inserted: false as const, chunk: existing };
  };

  const findByChunkIndexPrimary = async (sessionId: string, chunkIndex: number, tx?: Knex) => {
    return (tx || db)(TableName.PamSessionEventChunk).where({ sessionId, chunkIndex }).first();
  };

  return {
    ...orm,
    findAllBySessionId,
    findBySessionIdPaginated,
    findByChunkIndex,
    findByChunkIndexPrimary,
    insertIgnoreDuplicate,
    insertOrGetExisting
  };
};
