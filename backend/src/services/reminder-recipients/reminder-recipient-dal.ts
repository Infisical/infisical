import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TReminderRecipientDALFactory = ReturnType<typeof reminderRecipientDALFactory>;

export const reminderRecipientDALFactory = (db: TDbClient) => {
  const reminderRecipientOrm = ormify(db, TableName.ReminderRecipient);

  return { ...reminderRecipientOrm };
};
