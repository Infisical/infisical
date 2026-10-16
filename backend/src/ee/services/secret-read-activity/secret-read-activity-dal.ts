import { Knex } from "knex";
import RE2 from "re2";

import { TDbClient } from "@app/db";
import { AccessScope, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { chunkArray } from "@app/lib/fn";

import { getUtcMonthStart } from "./secret-read-activity-fns";
import { TSecretLastRead } from "./secret-read-activity-types";

const UPSERT_CHUNK_SIZE = 1000;
const LOOKUP_CHUNK_SIZE = 10_000;
const PARTITION_LOCK_TIMEOUT_MS = 10_000;
// Matches the migration, which creates the first partitions.
const PARTITION_FILLFACTOR = 90;
const PARTITION_NAME_PATTERN = new RE2(`^${TableName.SecretReadActivity}_(\\d{8})_(\\d{8})$`);

const formatPartitionDate = (date: Date) => date.toISOString().slice(0, 10).replaceAll("-", "");
const parsePartitionDate = (value: string) =>
  new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`);

export type TSecretReadActivityDALFactory = ReturnType<typeof secretReadActivityDALFactory>;

export const secretReadActivityDALFactory = (db: TDbClient) => {
  const upsertLastReads = async (rows: TSecretLastRead[], tx?: Knex) => {
    // Postgres refuses an upsert that touches the same row twice in one statement, so keep the latest per key.
    const latestByKey = new Map<string, TSecretLastRead>();
    rows.forEach((row) => {
      const key = `${row.objectId}:${row.actorId}:${row.objectType}`;
      const current = latestByKey.get(key);
      if (!current || new Date(row.lastReadAt) > new Date(current.lastReadAt)) latestByKey.set(key, row);
    });

    try {
      for (const chunk of chunkArray([...latestByKey.values()], UPSERT_CHUNK_SIZE)) {
        // eslint-disable-next-line no-await-in-loop
        await (tx || db)(TableName.SecretReadActivity)
          .insert(chunk.map((row) => ({ ...row, readMonth: getUtcMonthStart(row.lastReadAt) })))
          .onConflict(["objectId", "actorId", "objectType", "readMonth"])
          .merge(["lastReadAt"])
          .where(`${TableName.SecretReadActivity}.lastReadAt`, "<", db.raw("excluded.??", ["lastReadAt"]));
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Upsert secret read activity" });
    }
  };

  // A reader has one row per month, so the months are folded into the latest read.
  const findLastReads = async (objectIds: string[], since: Date, tx?: Knex) => {
    try {
      const rows: TSecretLastRead[] = [];
      for (const chunk of chunkArray(objectIds, LOOKUP_CHUNK_SIZE)) {
        // eslint-disable-next-line no-await-in-loop
        const batch = (await (tx || db.replicaNode())(TableName.SecretReadActivity)
          .whereIn("objectId", chunk)
          .where("readMonth", ">=", getUtcMonthStart(since))
          .where("lastReadAt", ">=", since)
          .groupBy("objectId", "objectType", "actorId", "actorType")
          .select("objectId", "objectType", "actorId", "actorType")
          .max("lastReadAt as lastReadAt")) as TSecretLastRead[];
        rows.push(...batch);
      }
      return rows;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find secret read activity" });
    }
  };

  const $listPartitions = async () => {
    const { rows } = (await db.raw(
      `SELECT c.relname AS name FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid WHERE i.inhparent = ?::regclass`,
      [TableName.SecretReadActivity]
    )) as { rows: { name: string }[] };
    return rows.flatMap(({ name }) => {
      const match = PARTITION_NAME_PATTERN.exec(name);
      return match ? [{ name, endsAt: parsePartitionDate(match[2]) }] : [];
    });
  };

  // Creating or dropping a partition takes an exclusive lock on the whole table. Give up rather than wait
  // behind a slow read, which would stall every query queued after it; the next run tries again.
  const $runPartitionDdl = (sql: string, identifiers: string[]) =>
    db.transaction(async (tx) => {
      await tx.raw(`SET LOCAL lock_timeout = ${PARTITION_LOCK_TIMEOUT_MS}`);
      await tx.raw(sql, identifiers);
    });

  const createMonthlyPartitions = async (firstMonth: Date, count: number) => {
    try {
      const existing = new Set((await $listPartitions()).map(({ name }) => name));
      let created = 0;
      for (let offset = 0; offset < count; offset += 1) {
        const from = getUtcMonthStart(firstMonth, offset);
        const to = getUtcMonthStart(firstMonth, offset + 1);
        const name = `${TableName.SecretReadActivity}_${formatPartitionDate(from)}_${formatPartitionDate(to)}`;
        if (!existing.has(name)) {
          // The bounds are inlined because DDL takes no bind parameters. They come from date math, not input.
          // eslint-disable-next-line no-await-in-loop
          await $runPartitionDdl(
            `CREATE TABLE IF NOT EXISTS ?? PARTITION OF ?? FOR VALUES FROM ('${from.toISOString()}') TO ('${to.toISOString()}') WITH (fillfactor = ${PARTITION_FILLFACTOR})`,
            [name, TableName.SecretReadActivity]
          );
          created += 1;
        }
      }
      return created;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create secret read activity partitions" });
    }
  };

  const dropPartitionsEndingBefore = async (cutoff: Date) => {
    try {
      const expired = (await $listPartitions()).filter(({ endsAt }) => endsAt <= cutoff);
      for (const { name } of expired) {
        // eslint-disable-next-line no-await-in-loop
        await $runPartitionDdl(`DROP TABLE IF EXISTS ??`, [name]);
      }
      return expired.length;
    } catch (error) {
      throw new DatabaseError({ error, name: "Drop secret read activity partitions" });
    }
  };

  // Reads are only known from when the table was created, so a window cannot start earlier than that.
  const findTrackingStartedAt = async (tx?: Knex) => {
    try {
      const migration = (await (tx || db.replicaNode())("infisical_migrations")
        .where("name", "like", "%_secret-read-activity.%")
        .first("migration_time")) as { migration_time: Date } | undefined;
      return migration?.migration_time;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find secret read activity tracking start" });
    }
  };

  // The last time each user or identity joined the project or had a role, privilege or folder grant created or
  // changed. Which secrets a change opened up is not recorded, so any of them restarts the window. Membership
  // updatedAt is left out because logins bump it.
  const findAccessChangedAt = async (projectId: string, tx?: Knex) => {
    try {
      const [roleChanges, privilegeChanges] = await Promise.all([
        (tx || db.replicaNode())(TableName.Membership)
          .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
          .where(`${TableName.Membership}.scope`, AccessScope.Project)
          .where(`${TableName.Membership}.scopeProjectId`, projectId)
          .select(
            db.ref("actorUserId").withSchema(TableName.Membership),
            db.ref("actorIdentityId").withSchema(TableName.Membership),
            db.ref("createdAt").withSchema(TableName.Membership).as("membershipCreatedAt"),
            db.ref("createdAt").withSchema(TableName.MembershipRole),
            db.ref("updatedAt").withSchema(TableName.MembershipRole)
          ),
        (tx || db.replicaNode())(TableName.AdditionalPrivilege)
          .where({ projectId })
          .select("actorUserId", "actorIdentityId", "createdAt", "updatedAt")
      ]);

      const changedAtByActorId = new Map<string, Date>();
      [...roleChanges, ...privilegeChanges].forEach((change) => {
        const actorId = change.actorUserId ?? change.actorIdentityId;
        if (!actorId) return;
        const dates = [change.createdAt, change.updatedAt];
        if ("membershipCreatedAt" in change) dates.push(change.membershipCreatedAt as Date);
        const latest = new Date(Math.max(...dates.map((date) => new Date(date).getTime())));
        const current = changedAtByActorId.get(actorId);
        if (!current || latest > current) changedAtByActorId.set(actorId, latest);
      });
      return changedAtByActorId;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project access changes" });
    }
  };

  return {
    upsertLastReads,
    findLastReads,
    createMonthlyPartitions,
    dropPartitionsEndingBefore,
    findTrackingStartedAt,
    findAccessChangedAt
  };
};
