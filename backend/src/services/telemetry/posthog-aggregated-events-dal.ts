import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { TPosthogAggregatedEvents } from "@app/db/schemas/posthog-aggregated-events";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols } from "@app/lib/knex";

export type TPosthogAggregatedEventsDALFactory = ReturnType<typeof posthogAggregatedEventsDALFactory>;

export const posthogAggregatedEventsDALFactory = (db: TDbClient) => {
  const posthogAggregatedEventsOrm = ormify(db, TableName.PosthogAggregatedEvents);

  const getAggregatedEvent = async (
    batchId: string,
    distinctId: string,
    event: string,
    tx?: Knex
  ): Promise<TPosthogAggregatedEvents | undefined> => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.PosthogAggregatedEvents)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter({ batchId, distinctId, event }, TableName.PosthogAggregatedEvents))
        .select(selectAllTableCols(TableName.PosthogAggregatedEvents))
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Get last hour aggregated events" });
    }
  };

  const getAllAggregatedEvent = async (
    batchId: string,
    event: string,
    tx?: Knex
  ): Promise<TPosthogAggregatedEvents[]> => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.PosthogAggregatedEvents)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter({ batchId, event }, TableName.PosthogAggregatedEvents))
        .select(selectAllTableCols(TableName.PosthogAggregatedEvents));
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "Get last hour aggregated events" });
    }
  };

  return {
    ...posthogAggregatedEventsOrm,
    getAggregatedEvent,
    getAllAggregatedEvent
  };
};
