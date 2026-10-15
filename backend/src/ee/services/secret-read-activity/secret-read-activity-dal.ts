import { TDbClient } from "@app/db";
import { TableName, TSecretReadActivity, TSecretReadActivityInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { chunkArray } from "@app/lib/fn";

const UPSERT_CHUNK_SIZE = 1000;
const LOOKUP_CHUNK_SIZE = 10_000;
const PRUNE_BATCH_SIZE = 10_000;

export type TSecretReadActivityDALFactory = ReturnType<typeof secretReadActivityDALFactory>;

export const secretReadActivityDALFactory = (db: TDbClient) => {
  const upsertLastReads = async (rows: TSecretReadActivityInsert[]) => {
    // Postgres refuses an upsert that touches the same row twice in one statement, so keep the latest per key.
    const latestByKey = new Map<string, TSecretReadActivityInsert>();
    rows.forEach((row) => {
      const key = `${row.objectId}:${row.actorId}:${row.objectType}`;
      const current = latestByKey.get(key);
      if (!current || new Date(row.lastReadAt) > new Date(current.lastReadAt)) latestByKey.set(key, row);
    });

    try {
      for (const chunk of chunkArray([...latestByKey.values()], UPSERT_CHUNK_SIZE)) {
        // eslint-disable-next-line no-await-in-loop
        await db(TableName.SecretReadActivity)
          .insert(chunk)
          .onConflict(["objectId", "actorId", "objectType"])
          .merge(["lastReadAt"])
          .where(`${TableName.SecretReadActivity}.lastReadAt`, "<", db.raw("excluded.??", ["lastReadAt"]));
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Upsert secret read activity" });
    }
  };

  const findLastReads = async (objectIds: string[], since: Date) => {
    try {
      const rows: TSecretReadActivity[] = [];
      for (const chunk of chunkArray(objectIds, LOOKUP_CHUNK_SIZE)) {
        // eslint-disable-next-line no-await-in-loop
        const batch = await db
          .replicaNode()(TableName.SecretReadActivity)
          .whereIn("objectId", chunk)
          .where("lastReadAt", ">=", since);
        rows.push(...batch);
      }
      return rows;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find secret read activity" });
    }
  };

  // Walks the primary key in batches: lastReadAt has no index, and searching by it would scan the table
  // once per batch.
  const pruneOlderThan = async (cutoff: Date) => {
    let deleted = 0;
    let cursor: { objectId: string; actorId: string; objectType: string } | undefined;
    try {
      for (;;) {
        const after = cursor;
        // eslint-disable-next-line no-await-in-loop
        const batch = await db(TableName.SecretReadActivity)
          .where((qb) => {
            if (after) {
              void qb.whereRaw(`("objectId", "actorId", "objectType") > (?, ?, ?)`, [
                after.objectId,
                after.actorId,
                after.objectType
              ]);
            }
          })
          .orderBy([{ column: "objectId" }, { column: "actorId" }, { column: "objectType" }])
          .limit(PRUNE_BATCH_SIZE)
          .select("objectId", "actorId", "objectType", "lastReadAt");

        const expired = batch.filter((row) => row.lastReadAt < cutoff);
        if (expired.length) {
          // eslint-disable-next-line no-await-in-loop
          deleted += await db(TableName.SecretReadActivity)
            .whereIn(
              ["objectId", "actorId", "objectType"],
              expired.map((row) => [row.objectId, row.actorId, row.objectType])
            )
            .del();
        }

        if (batch.length < PRUNE_BATCH_SIZE) break;
        cursor = batch[batch.length - 1];
      }
      return deleted;
    } catch (error) {
      throw new DatabaseError({ error, name: "Prune secret read activity" });
    }
  };

  // Reads are only known from when the table was created, so a window cannot start earlier than that.
  const findTrackingStartedAt = async () => {
    try {
      const migration = (await db("infisical_migrations")
        .where("name", "like", "%_secret-read-activity.%")
        .first("migration_time")) as { migration_time: Date } | undefined;
      return migration?.migration_time;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find secret read activity tracking start" });
    }
  };

  return { upsertLastReads, findLastReads, pruneOlderThan, findTrackingStartedAt };
};
