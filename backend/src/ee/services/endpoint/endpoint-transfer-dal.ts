import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TEndpointTransferDALFactory = ReturnType<typeof endpointTransferDALFactory>;

export type TRecordEndpointTransfer = {
  deviceId: string;
  destination: string;
  bucketStartedAt: Date;
  bytesOut: number;
  seenAt: Date;
  blocked: boolean;
};

export type TEndpointTransferHistoryEntry = {
  destination: string;
  totalBytesOut: number;
  peakBytesOut: number;
  activeBuckets: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  blocked: boolean;
};

export const endpointTransferDALFactory = (db: TDbClient) => {
  const transferOrm = ormify(db, TableName.EndpointTransferBucket);

  // Each report is what the device sent since its last heartbeat, so bytes are added rather than
  // replaced: a bucket is the sum of every delta that landed in that minute. Replacing would leave
  // the history showing the last second or two of a transfer instead of the whole of it.
  const recordTransfers = async (transfers: TRecordEndpointTransfer[], tx?: Knex) => {
    if (!transfers.length) return;

    try {
      await (tx || db)(TableName.EndpointTransferBucket)
        .insert(
          transfers.map(({ seenAt, ...transfer }) => ({
            ...transfer,
            firstSeenAt: seenAt,
            lastSeenAt: seenAt
          }))
        )
        .onConflict(["deviceId", "destination", "bucketStartedAt"])
        .merge({
          bytesOut: db.raw(`"${TableName.EndpointTransferBucket}"."bytesOut" + EXCLUDED."bytesOut"`),
          lastSeenAt: db.raw(`GREATEST("${TableName.EndpointTransferBucket}"."lastSeenAt", EXCLUDED."lastSeenAt")`),
          // A destination blocked at any point in the minute stays blocked for that minute: the later
          // reports in the same bucket are the tail of the transfer that was already cut off.
          blocked: db.raw(`"${TableName.EndpointTransferBucket}"."blocked" OR EXCLUDED."blocked"`),
          updatedAt: new Date()
        });
    } catch (error) {
      throw new DatabaseError({ error, name: "Record endpoint transfers" });
    }
  };

  // Rolled up per destination rather than returned as raw buckets: the reader's question is "where did
  // this machine's traffic go", and a minute-by-minute list of one destination buries it. The buckets
  // are still what make the answer honest — a peak rate needs a fixed span to be a rate, and counting
  // them is what separates a device that sent steadily for an hour from one that burst for a minute.
  const findHistoryByDevice = async (
    {
      projectId,
      deviceId,
      since,
      limit
    }: {
      projectId: string;
      deviceId?: string;
      since: Date;
      limit: number;
    },
    tx?: Knex
  ): Promise<TEndpointTransferHistoryEntry[]> => {
    try {
      const query = (tx || db.replicaNode())(TableName.EndpointTransferBucket)
        .join(
          TableName.EndpointDevice,
          `${TableName.EndpointDevice}.id`,
          `${TableName.EndpointTransferBucket}.deviceId`
        )
        .where(`${TableName.EndpointDevice}.projectId`, projectId)
        .andWhere(`${TableName.EndpointTransferBucket}.bucketStartedAt`, ">=", since)
        .groupBy(`${TableName.EndpointTransferBucket}.destination`)
        .select(db.ref("destination").withSchema(TableName.EndpointTransferBucket))
        .select(
          db.raw(`SUM("${TableName.EndpointTransferBucket}"."bytesOut") AS "totalBytesOut"`),
          db.raw(`MAX("${TableName.EndpointTransferBucket}"."bytesOut") AS "peakBytesOut"`),
          db.raw(`COUNT(*) AS "activeBuckets"`),
          db.raw(`MIN("${TableName.EndpointTransferBucket}"."firstSeenAt") AS "firstSeenAt"`),
          db.raw(`MAX("${TableName.EndpointTransferBucket}"."lastSeenAt") AS "lastSeenAt"`),
          db.raw(`BOOL_OR("${TableName.EndpointTransferBucket}"."blocked") AS "blocked"`)
        )
        .orderByRaw(`MAX("${TableName.EndpointTransferBucket}"."lastSeenAt") DESC`)
        .limit(limit);

      if (deviceId) {
        void query.andWhere(`${TableName.EndpointTransferBucket}.deviceId`, deviceId);
      }

      const rows = (await query) as unknown as {
        destination: string;
        totalBytesOut: string;
        peakBytesOut: string;
        activeBuckets: string;
        firstSeenAt: Date;
        lastSeenAt: Date;
        blocked: boolean;
      }[];

      // SUM and COUNT over a bigint come back as strings from pg, and a count is small enough that the
      // conversion is exact.
      return rows.map((row) => ({
        destination: row.destination,
        totalBytesOut: Number(row.totalBytesOut),
        peakBytesOut: Number(row.peakBytesOut),
        activeBuckets: Number(row.activeBuckets),
        firstSeenAt: row.firstSeenAt,
        lastSeenAt: row.lastSeenAt,
        blocked: row.blocked
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find endpoint transfer history by device" });
    }
  };

  return { ...transferOrm, recordTransfers, findHistoryByDevice };
};
