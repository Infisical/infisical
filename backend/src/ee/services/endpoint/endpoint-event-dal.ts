import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TEndpointEventsInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TEndpointEventDALFactory = ReturnType<typeof endpointEventDALFactory>;

export const endpointEventDALFactory = (db: TDbClient) => {
  const eventOrm = ormify(db, TableName.EndpointEvent);

  // The agent retries a batch it is unsure landed, so a replayed idempotencyKey is expected
  // traffic rather than an error.
  const insertIgnoringDuplicates = async (data: TEndpointEventsInsert[], tx?: Knex) => {
    if (!data.length) return [];

    try {
      return await (tx || db)(TableName.EndpointEvent)
        .insert(data)
        .onConflict("idempotencyKey")
        .ignore()
        .returning("*");
    } catch (error) {
      throw new DatabaseError({ error, name: "Insert endpoint events" });
    }
  };

  const findFeedByProject = async (
    {
      projectId,
      deviceId,
      limit,
      cursor
    }: { projectId: string; deviceId?: string; limit: number; cursor?: { occurredAt: Date; id: string } },
    tx?: Knex
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.EndpointEvent)
        .join(TableName.EndpointDevice, `${TableName.EndpointDevice}.id`, `${TableName.EndpointEvent}.deviceId`)
        .where(`${TableName.EndpointEvent}.projectId`, projectId)
        .orderBy([
          { column: `${TableName.EndpointEvent}.occurredAt`, order: "desc" },
          { column: `${TableName.EndpointEvent}.id`, order: "desc" }
        ])
        .limit(limit)
        .select(selectAllTableCols(TableName.EndpointEvent))
        .select(db.ref("name").withSchema(TableName.EndpointDevice).as("deviceName"));

      if (deviceId) {
        void query.andWhere(`${TableName.EndpointEvent}.deviceId`, deviceId);
      }

      if (cursor) {
        void query.whereRaw(`("${TableName.EndpointEvent}"."occurredAt", "${TableName.EndpointEvent}"."id") < (?, ?)`, [
          cursor.occurredAt,
          cursor.id
        ]);
      }

      return await query;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find endpoint event feed" });
    }
  };

  return { ...eventOrm, insertIgnoringDuplicates, findFeedByProject };
};
