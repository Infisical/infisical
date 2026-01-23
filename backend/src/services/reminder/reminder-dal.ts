import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { TOrganizations } from "@app/db/schemas/organizations";
import { TProjectEnvironments } from "@app/db/schemas/project-environments";
import { TProjects } from "@app/db/schemas/projects";
import { TSecretFolders } from "@app/db/schemas/secret-folders";
import { TSecretsV2 } from "@app/db/schemas/secrets-v2";
import { TUsers } from "@app/db/schemas/users";
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

  return {
    ...reminderOrm,
    findSecretDailyReminders,
    findUpcomingReminders,
    findSecretReminder,
    findSecretReminders
  };
};
