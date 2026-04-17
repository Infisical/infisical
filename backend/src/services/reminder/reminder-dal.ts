import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  TableName,
  TOrganizations,
  TProjectEnvironments,
  TProjects,
  TSecretFolders,
  TSecretsV2,
  TUsers
} from "@app/db/schemas";
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

  const findSecretDailyReminders = async (tx?: Knex) => {
    const { startOfDay, endOfDay } = getTodayDateRange();

    const rawReminders = await (tx || db.replicaNode())(TableName.Reminder)
      .whereBetween("nextReminderDate", [startOfDay, endOfDay])
      .leftJoin(TableName.ReminderRecipient, `${TableName.Reminder}.id`, `${TableName.ReminderRecipient}.reminderId`)
      .leftJoin<TUsers>(TableName.Users, `${TableName.ReminderRecipient}.userId`, `${TableName.Users}.id`)
      .leftJoin<TSecretsV2>(TableName.SecretV2, `${TableName.Reminder}.secretId`, `${TableName.SecretV2}.id`)
      .leftJoin<TSecretFolders>(
        TableName.SecretFolder,
        `${TableName.SecretV2}.folderId`,
        `${TableName.SecretFolder}.id`
      )
      .leftJoin<TProjectEnvironments>(
        TableName.Environment,
        `${TableName.SecretFolder}.envId`,
        `${TableName.Environment}.id`
      )
      .leftJoin<TProjects>(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
      .leftJoin<TOrganizations>(TableName.Organization, `${TableName.Project}.orgId`, `${TableName.Organization}.id`)
      .select(selectAllTableCols(TableName.Reminder))
      .select(db.ref("email").withSchema(TableName.Users))
      .select(db.ref("name").withSchema(TableName.Project).as("projectName"))
      .select(db.ref("id").withSchema(TableName.Project).as("projectId"))
      .select(db.ref("name").withSchema(TableName.Organization).as("organizationName"));

    const reminders = sqlNestRelationships({
      data: rawReminders,
      key: "id",
      parentMapper: (el) => ({
        _id: el.id,
        ...RemindersSchema.parse(el),
        projectName: el.projectName,
        projectId: el.projectId,
        organizationName: el.organizationName
      }),
      childrenMapper: [
        {
          key: "email",
          label: "recipients" as const,
          mapper: ({ email }) => ({
            email
          })
        }
      ]
    });
    return reminders;
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
    findSecretDailyReminders,
    findUpcomingReminders,
    findSecretReminder,
    findSecretReminders,
    findByProjectAndDateRange
  };
};
