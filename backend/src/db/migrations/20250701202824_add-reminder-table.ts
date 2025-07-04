import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Reminders))) {
    await knex.schema.createTable(TableName.Reminders, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("secretId").nullable();
      t.foreign("secretId").references("id").inTable(TableName.SecretV2).onDelete("CASCADE");
      t.string("message").nullable();
      t.integer("repeatDays").nullable();
      t.timestamp("nextReminderDate").notNullable();
      t.timestamps(true, true, true);
      t.index("secretId");
    });
  }

  if (!(await knex.schema.hasTable(TableName.RemindersRecipients))) {
    await knex.schema.createTable(TableName.RemindersRecipients, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("reminderId").notNullable();
      t.foreign("reminderId").references("id").inTable(TableName.Reminders).onDelete("CASCADE");
      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.timestamps(true, true, true);
      t.index("reminderId");
      t.index("userId");
    });
  }

  await createOnUpdateTrigger(knex, TableName.Reminders);
  await createOnUpdateTrigger(knex, TableName.RemindersRecipients);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.Reminders);
  await knex.schema.dropTableIfExists(TableName.RemindersRecipients);
  await dropOnUpdateTrigger(knex, TableName.Reminders);
  await dropOnUpdateTrigger(knex, TableName.RemindersRecipients);
}
