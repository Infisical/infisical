import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TProjectEnvironments, TProjects, TSecretFolders, TSecretsV2 } from "@app/db/schemas";
import { RemindersSchema } from "@app/db/schemas/reminders";
import { ormify, selectAllTableCols } from "@app/lib/knex";

const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

export type TReminderDALFactory = ReturnType<typeof reminderDALFactory>;

export const reminderDALFactory = (db: TDbClient) => {
  const reminderOrm = ormify(db, TableName.Reminder);

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
          // alerts.resourceId is text and secrets_v2.id is a uuid, so the id is cast to compare them. The
          // cast only runs on values shaped like a uuid, so a malformed id becomes NULL (and is reaped)
          // instead of failing the whole query.
          .whereRaw(
            `"${TableName.SecretV2}"."id" = CASE WHEN "${TableName.Alert}"."resourceId" ~* ? THEN "${TableName.Alert}"."resourceId"::uuid END`,
            [UUID_PATTERN]
          );
      })
      .limit(limit)
      .select(`${TableName.Alert}.resourceId`)) as { resourceId: string }[];

    return rows.map((row) => row.resourceId);
  };

  const findByIdForUpdate = async (id: string, tx: Knex) => {
    const reminder = await tx(TableName.Reminder).where({ id }).forUpdate().first();
    return reminder;
  };

  // Recipients are not stored here: they live on the reminder's alert email channel.
  const findSecretReminder = async (secretId: string, tx?: Knex) => {
    const reminder = await (tx || db.replicaNode())(TableName.Reminder)
      .where(`${TableName.Reminder}.secretId`, secretId)
      .select(selectAllTableCols(TableName.Reminder))
      .first();
    return reminder ? RemindersSchema.parse(reminder) : null;
  };

  const findSecretReminders = async (secretIds: string[], tx?: Knex) => {
    const reminders = await (tx || db.replicaNode())(TableName.Reminder)
      .whereIn(`${TableName.Reminder}.secretId`, secretIds)
      .select(selectAllTableCols(TableName.Reminder));
    return reminders.map((reminder) => RemindersSchema.parse(reminder));
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
    findByIdForUpdate,
    findOrphanedReminderAlertResourceIds,
    findSecretReminder,
    findSecretReminders,
    findByProjectAndDateRange
  };
};
