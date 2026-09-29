import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TProjectEnvironments, TProjects, TSecretFolders, TSecretsV2 } from "@app/db/schemas";
import { RemindersSchema } from "@app/db/schemas/reminders";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";

export type TReminderDALFactory = ReturnType<typeof reminderDALFactory>;

export const reminderDALFactory = (db: TDbClient) => {
  const reminderOrm = ormify(db, TableName.Reminder);

  const getTodayDateRange = () => {
    const today = new Date();
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth();
    const date = today.getUTCDate();

    // Start of day: 00:00:00.000 UTC
    const startOfDay = new Date(Date.UTC(year, month, date, 0, 0, 0, 0));

    // End of day: 23:59:59.999 UTC
    const endOfDay = new Date(Date.UTC(year, month, date, 23, 59, 59, 999));

    return {
      startOfDay,
      endOfDay
    };
  };

  // Due reminders whose secret is still live. Soft-deleted environments and projects keep their
  // reminders so a restore brings them back, but they do not fire in the meantime.
  const findDueReminders = async ({ from, to }: { from: Date; to: Date }, tx?: Knex) => {
    const rows = await (tx || db.replicaNode())(TableName.Reminder)
      .whereBetween(`${TableName.Reminder}.nextReminderDate`, [from, to])
      .join<TSecretsV2>(TableName.SecretV2, `${TableName.Reminder}.secretId`, `${TableName.SecretV2}.id`)
      .join<TSecretFolders>(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
      .join<TProjectEnvironments>(
        TableName.Environment,
        `${TableName.SecretFolder}.envId`,
        `${TableName.Environment}.id`
      )
      .join<TProjects>(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
      .whereNull(`${TableName.Environment}.deleteAfter`)
      .whereNull(`${TableName.Project}.deleteAfter`)
      .orderBy(`${TableName.Reminder}.nextReminderDate`, "asc")
      .select(selectAllTableCols(TableName.Reminder))
      .select(db.ref("id").withSchema(TableName.Project).as("projectId"))
      .select(db.ref("orgId").withSchema(TableName.Project).as("orgId"));

    return rows.map((row) => ({
      ...RemindersSchema.parse(row),
      projectId: (row as unknown as { projectId: string }).projectId,
      orgId: (row as unknown as { orgId: string }).orgId
    }));
  };

  // Reminder alerts whose secret row is gone. Alerts have no foreign key to secrets, so this is how
  // every secret delete path (including folder and environment cascades) gets cleaned up.
  const findOrphanedReminderAlertResourceIds = async (
    { resourceType, limit }: { resourceType: string; limit: number },
    tx?: Knex
  ): Promise<string[]> => {
    const rows = (await (tx || db.replicaNode())(TableName.Alert)
      .where(`${TableName.Alert}.resourceType`, resourceType)
      .whereNotNull(`${TableName.Alert}.resourceId`)
      .whereNotExists((qb) => {
        void qb
          .select(db.raw("1"))
          .from(TableName.SecretV2)
          // The CASE keeps a non-uuid resourceId from failing the cast for the whole query.
          .whereRaw(
            `"${TableName.SecretV2}"."id" = CASE WHEN "${TableName.Alert}"."resourceId" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN "${TableName.Alert}"."resourceId"::uuid END`
          );
      })
      .limit(limit)
      .select(`${TableName.Alert}.resourceId`)) as { resourceId: string }[];

    return rows.map((row) => row.resourceId);
  };

  const findUpcomingReminders = async (daysAhead: number = 7, tx?: Knex) => {
    const { startOfDay } = getTodayDateRange();
    const futureDate = new Date(startOfDay);
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const reminders = await (tx || db.replicaNode())(TableName.Reminder)
      .where("nextReminderDate", ">=", startOfDay)
      .where("nextReminderDate", "<=", futureDate)
      .orderBy("nextReminderDate", "asc")
      .leftJoin(TableName.ReminderRecipient, `${TableName.Reminder}.id`, `${TableName.ReminderRecipient}.reminderId`)
      .select(selectAllTableCols(TableName.Reminder))
      .select(db.ref("userId").withSchema(TableName.ReminderRecipient));
    return reminders;
  };

  const findSecretReminder = async (secretId: string, tx?: Knex) => {
    const rawReminders = await (tx || db.replicaNode())(TableName.Reminder)
      .where(`${TableName.Reminder}.secretId`, secretId)
      .leftJoin(TableName.ReminderRecipient, `${TableName.Reminder}.id`, `${TableName.ReminderRecipient}.reminderId`)
      .select(selectAllTableCols(TableName.Reminder))
      .select(db.ref("userId").withSchema(TableName.ReminderRecipient));
    const reminders = sqlNestRelationships({
      data: rawReminders,
      key: "id",
      parentMapper: (el) => ({
        _id: el.id,
        ...RemindersSchema.parse(el)
      }),
      childrenMapper: [
        {
          key: "userId",
          label: "recipients" as const,
          mapper: ({ userId }) => userId
        }
      ]
    });
    return reminders[0] || null;
  };

  const findSecretReminders = async (secretIds: string[], tx?: Knex) => {
    const rawReminders = await (tx || db.replicaNode())(TableName.Reminder)
      .whereIn(`${TableName.Reminder}.secretId`, secretIds)
      .leftJoin(TableName.ReminderRecipient, `${TableName.Reminder}.id`, `${TableName.ReminderRecipient}.reminderId`)
      .select(selectAllTableCols(TableName.Reminder))
      .select(db.ref("userId").withSchema(TableName.ReminderRecipient));
    const reminders = sqlNestRelationships({
      data: rawReminders,
      key: "id",
      parentMapper: (el) => ({
        _id: el.id,
        ...RemindersSchema.parse(el)
      }),
      childrenMapper: [
        {
          key: "userId",
          label: "recipients" as const,
          mapper: ({ userId }) => userId
        }
      ]
    });
    return reminders;
  };

  const findByProjectAndDateRange = async (
    {
      projectId,
      startDate,
      endDate
    }: {
      projectId: string;
      startDate: Date;
      endDate: Date;
    },
    tx?: Knex
  ) => {
    const query = (tx || db.replicaNode())(TableName.Reminder)
      .whereNotNull(`${TableName.Reminder}.secretId`)
      .whereBetween(`${TableName.Reminder}.nextReminderDate`, [startDate, endDate])
      .join<TSecretsV2>(TableName.SecretV2, `${TableName.Reminder}.secretId`, `${TableName.SecretV2}.id`)
      .join<TSecretFolders>(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
      .join<TProjectEnvironments>(
        TableName.Environment,
        `${TableName.SecretFolder}.envId`,
        `${TableName.Environment}.id`
      )
      .whereNull(`${TableName.Environment}.deleteAfter`)
      .where(`${TableName.Environment}.projectId`, projectId);

    const rawReminders = await query
      .select(selectAllTableCols(TableName.Reminder))
      .select(
        db.ref("key").withSchema(TableName.SecretV2).as("secretKey"),
        db.ref("folderId").withSchema(TableName.SecretV2).as("secretFolderId"),
        db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
        db.ref("name").withSchema(TableName.Environment).as("envName")
      );

    return rawReminders.map((r) => ({
      id: r.id,
      secretId: r.secretId,
      secretKey: (r as unknown as Record<string, string>).secretKey,
      nextReminderDate: r.nextReminderDate,
      message: r.message,
      repeatDays: r.repeatDays,
      folderId: (r as unknown as Record<string, string>).secretFolderId,
      envSlug: (r as unknown as Record<string, string>).envSlug,
      envName: (r as unknown as Record<string, string>).envName
    }));
  };

  return {
    ...reminderOrm,
    findDueReminders,
    findOrphanedReminderAlertResourceIds,
    findUpcomingReminders,
    findSecretReminder,
    findSecretReminders,
    findByProjectAndDateRange
  };
};
