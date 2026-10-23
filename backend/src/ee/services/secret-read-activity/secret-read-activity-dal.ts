import { Knex } from "knex";
import RE2 from "re2";

import { TDbClient } from "@app/db";
import { AccessScope, ProjectMembershipRole, TableName } from "@app/db/schemas";
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
        for (const row of batch) rows.push(row);
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

  type TRoleSourceRow = {
    membershipRoleId: string;
    actorUserId: string | null;
    actorIdentityId: string | null;
    actorGroupId: string | null;
    membershipCreatedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    isTemporary: boolean;
    temporaryAccessEndTime: Date | null;
    customRoleUpdatedAt: Date | null;
  };

  type TPrivilegeSourceRow = {
    id: string;
    actorUserId: string | null;
    actorIdentityId: string | null;
    folderId: string | null;
    createdAt: Date;
    updatedAt: Date;
    isTemporary: boolean;
    temporaryAccessEndTime: Date | null;
  };

  // When each source of project access last changed, so a secret's access can be dated from the oldest source that
  // grants it: every role assignment (of users, identities and groups, with the last edit to a custom role's rules,
  // since which secrets an edit opened is not recorded), and every privilege and folder grant. Membership updatedAt
  // is left out because logins bump it. Expired access is not a source, but a restriction ending can give access
  // back, so its end is kept as the earliest that access can date from: an expired folder grant's in its folder, and
  // an expired temporary role's or privilege's for the whole of its holder's access.
  const findAccessSourceDates = async (projectId: string, tx?: Knex) => {
    try {
      const [roleRows, privilegeRows] = (await Promise.all([
        (tx || db.replicaNode())(TableName.Membership)
          .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
          .leftJoin(TableName.Role, `${TableName.MembershipRole}.customRoleId`, `${TableName.Role}.id`)
          .where(`${TableName.Membership}.scope`, AccessScope.Project)
          .where(`${TableName.Membership}.scopeProjectId`, projectId)
          .select(
            db.ref("id").withSchema(TableName.MembershipRole).as("membershipRoleId"),
            db.ref("actorUserId").withSchema(TableName.Membership),
            db.ref("actorIdentityId").withSchema(TableName.Membership),
            db.ref("actorGroupId").withSchema(TableName.Membership),
            db.ref("createdAt").withSchema(TableName.Membership).as("membershipCreatedAt"),
            db.ref("createdAt").withSchema(TableName.MembershipRole),
            db.ref("updatedAt").withSchema(TableName.MembershipRole),
            db.ref("isTemporary").withSchema(TableName.MembershipRole),
            db.ref("temporaryAccessEndTime").withSchema(TableName.MembershipRole),
            db.ref("updatedAt").withSchema(TableName.Role).as("customRoleUpdatedAt")
          ),
        (tx || db.replicaNode())(TableName.AdditionalPrivilege)
          .where({ projectId })
          .select(
            "id",
            "actorUserId",
            "actorIdentityId",
            "folderId",
            "createdAt",
            "updatedAt",
            "isTemporary",
            "temporaryAccessEndTime"
          )
      ])) as [TRoleSourceRow[], TPrivilegeSourceRow[]];

      const now = new Date();
      const isExpired = (row: { isTemporary: boolean; temporaryAccessEndTime: Date | null }) =>
        row.isTemporary && (!row.temporaryAccessEndTime || new Date(row.temporaryAccessEndTime) <= now);
      const latestOf = (dates: (Date | null)[]) =>
        new Date(Math.max(...dates.flatMap((date) => (date ? [new Date(date).getTime()] : []))));

      // Keyed by the user, identity or group that held it: when its latest temporary role or privilege expired.
      const accessReopenedAt = new Map<string, Date>();
      const raise = (dates: Map<string, Date>, key: string, date: Date) => {
        const current = dates.get(key);
        if (!current || date > current) dates.set(key, date);
      };
      const recordExpiry = (holderId: string | null, endedAt: Date | null) => {
        if (holderId && endedAt) raise(accessReopenedAt, holderId, new Date(endedAt));
      };

      const roleDates = new Map<string, Date>();
      const groupDates = new Map<string, Date>();
      roleRows.forEach((row) => {
        if (isExpired(row)) {
          recordExpiry(row.actorUserId ?? row.actorIdentityId ?? row.actorGroupId, row.temporaryAccessEndTime);
          return;
        }
        const date = latestOf([row.membershipCreatedAt, row.createdAt, row.updatedAt, row.customRoleUpdatedAt]);
        roleDates.set(row.membershipRoleId, date);
        if (row.actorGroupId) raise(groupDates, row.actorGroupId, date);
      });

      const privilegeDates = new Map<string, Date>();
      const editedPrivilegeIds = new Set<string>();
      // Keyed "<actorId>:<folderId>": when an expired folder grant last gave access back in that folder.
      const folderReopenedAt = new Map<string, Date>();
      privilegeRows.forEach((row) => {
        const actorId = row.actorUserId ?? row.actorIdentityId;
        if (!isExpired(row)) {
          privilegeDates.set(row.id, latestOf([row.createdAt, row.updatedAt]));
          if (new Date(row.updatedAt) > new Date(row.createdAt)) editedPrivilegeIds.add(row.id);
          return;
        }
        if (!row.folderId) recordExpiry(actorId, row.temporaryAccessEndTime);
        else if (actorId && row.temporaryAccessEndTime) {
          raise(folderReopenedAt, `${actorId}:${row.folderId}`, new Date(row.temporaryAccessEndTime));
        }
      });

      return { roleDates, groupDates, privilegeDates, editedPrivilegeIds, folderReopenedAt, accessReopenedAt };
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project access source dates" });
    }
  };

  // Users and identities that hold the project Admin role now, directly or through a group. A temporary role counts
  // until it expires.
  const findAdminActorIds = async (projectId: string, tx?: Knex) => {
    try {
      const adminMemberships = (qb: Knex.QueryBuilder) =>
        qb
          .join(TableName.MembershipRole, `${TableName.Membership}.id`, `${TableName.MembershipRole}.membershipId`)
          .where(`${TableName.Membership}.scope`, AccessScope.Project)
          .where(`${TableName.Membership}.scopeProjectId`, projectId)
          .where(`${TableName.MembershipRole}.role`, ProjectMembershipRole.Admin)
          .where((roleQb) => {
            void roleQb
              .where(`${TableName.MembershipRole}.isTemporary`, false)
              .orWhere(`${TableName.MembershipRole}.temporaryAccessEndTime`, ">", new Date());
          });

      const [directAdmins, groupUserAdmins, groupIdentityAdmins] = (await Promise.all([
        adminMemberships((tx || db.replicaNode())(TableName.Membership)).select(
          db.ref("actorUserId").withSchema(TableName.Membership),
          db.ref("actorIdentityId").withSchema(TableName.Membership)
        ),
        adminMemberships(
          (tx || db.replicaNode())(TableName.Membership).join(
            TableName.UserGroupMembership,
            `${TableName.Membership}.actorGroupId`,
            `${TableName.UserGroupMembership}.groupId`
          )
        ).select(db.ref("userId").withSchema(TableName.UserGroupMembership)),
        adminMemberships(
          (tx || db.replicaNode())(TableName.Membership).join(
            TableName.IdentityGroupMembership,
            `${TableName.Membership}.actorGroupId`,
            `${TableName.IdentityGroupMembership}.groupId`
          )
        ).select(db.ref("identityId").withSchema(TableName.IdentityGroupMembership))
      ])) as [
        { actorUserId: string | null; actorIdentityId: string | null }[],
        { userId: string }[],
        { identityId: string }[]
      ];

      return new Set([
        ...directAdmins.flatMap(({ actorUserId, actorIdentityId }) => {
          const actorId = actorUserId ?? actorIdentityId;
          return actorId ? [actorId] : [];
        }),
        ...groupUserAdmins.map(({ userId }) => userId),
        ...groupIdentityAdmins.map(({ identityId }) => identityId)
      ]);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project admins" });
    }
  };

  return {
    findAdminActorIds,
    upsertLastReads,
    findLastReads,
    createMonthlyPartitions,
    dropPartitionsEndingBefore,
    findTrackingStartedAt,
    findAccessSourceDates
  };
};
