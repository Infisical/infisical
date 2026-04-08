import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TPamSessionEventBatchDALFactory = ReturnType<typeof pamSessionEventBatchDALFactory>;

export const pamSessionEventBatchDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamSessionEventBatch);

  const findBySessionIdPaginated = async (
    sessionId: string,
    { offset, limit }: { offset: number; limit: number },
    tx?: Knex
  ) => {
    return (tx || db.replicaNode())(TableName.PamSessionEventBatch)
      .where("sessionId", sessionId)
      .orderBy("startOffset", "asc")
      .limit(limit)
      .offset(offset)
      .select("*");
  };

  const upsertBatch = async (sessionId: string, startOffset: number, encryptedEventsBlob: Buffer, tx?: Knex) => {
    const result = await (tx || db)(TableName.PamSessionEventBatch)
      .insert({ sessionId, startOffset, encryptedEventsBlob })
      .onConflict(["sessionId", "startOffset"])
      .merge(["encryptedEventsBlob"]) // on re-upload of the same offset, overwrite the blob instead of erroring or skipping
      .returning(db.raw("(xmax = 0) as inserted"));
    return { wasInserted: result[0]?.inserted === true };
  };

  return { ...orm, findBySessionIdPaginated, upsertBatch };
};
