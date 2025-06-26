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
      throw new DatabaseError({
        error,
        name: `Get aggregated events for event: ${event} with distinctId: ${distinctId}`
      });
    }
  };

  const getAllAggregatedEvent = async (event: string, tx?: Knex): Promise<Map<string, TPosthogAggregatedEvents[]>> => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.PosthogAggregatedEvents)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter({ event }, TableName.PosthogAggregatedEvents))
        .select(selectAllTableCols(TableName.PosthogAggregatedEvents));

      // Group by [distinctId, event, organizationId]
      const grouped = new Map<string, TPosthogAggregatedEvents[]>();

      docs.forEach((doc) => {
        const key = JSON.stringify({ id: doc.distinctId, org: doc.organizationId });
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(doc);
      });

      return grouped;
    } catch (error) {
      throw new DatabaseError({ error, name: `Get aggregated events for event: ${event}` });
    }
  };

  return {
    ...posthogAggregatedEventsOrm,
    getAggregatedEvent,
    getAllAggregatedEvent
  };
};
