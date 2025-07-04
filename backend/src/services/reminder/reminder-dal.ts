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
  const reminderOrm = ormify(db, TableName.Reminders);

  const getTodayDateRange = () => {
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

    return { startOfDay, endOfDay };
  };

  const findSecretDailyReminders = async (tx?: Knex) => {
    const { startOfDay, endOfDay } = getTodayDateRange();

    const rawReminders = await (tx || db)(TableName.Reminders)
      .whereBetween("nextReminderDate", [startOfDay, endOfDay])
      .leftJoin(
        TableName.RemindersRecipients,
        `${TableName.Reminders}.id`,
        `${TableName.RemindersRecipients}.reminderId`
      )
      .leftJoin<TUsers>(TableName.Users, `${TableName.RemindersRecipients}.userId`, `${TableName.Users}.id`)
      .leftJoin<TSecretsV2>(TableName.SecretV2, `${TableName.Reminders}.secretId`, `${TableName.SecretV2}.id`)
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
      .select(selectAllTableCols(TableName.Reminders))
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

    const reminders = await (tx || db)(TableName.Reminders)
      .where("nextReminderDate", ">=", startOfDay)
      .where("nextReminderDate", "<=", futureDate)
      .orderBy("nextReminderDate", "asc")
      .leftJoin(
        TableName.RemindersRecipients,
        `${TableName.Reminders}.id`,
        `${TableName.RemindersRecipients}.reminderId`
      )
      .select(selectAllTableCols(TableName.Reminders))
      .select(db.ref("userId").withSchema(TableName.RemindersRecipients));
    return reminders;
  };

  const findSecretReminder = async (secretId: string, tx?: Knex) => {
    const rawReminders = await (tx || db)(TableName.Reminders)
      .where(`${TableName.Reminders}.secretId`, secretId)
      .leftJoin(
        TableName.RemindersRecipients,
        `${TableName.Reminders}.id`,
        `${TableName.RemindersRecipients}.reminderId`
      )
      .select(selectAllTableCols(TableName.Reminders))
      .select(db.ref("userId").withSchema(TableName.RemindersRecipients));
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

  return {
    ...reminderOrm,
    findSecretDailyReminders,
    findUpcomingReminders,
    findSecretReminder
  };
};
