import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Reminder))) {
    await knex.schema.createTable(TableName.Reminder, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("secretId").nullable();
      t.foreign("secretId").references("id").inTable(TableName.SecretV2).onDelete("CASCADE");
      t.string("message", 1024).nullable();
      t.integer("repeatDays").checkPositive().nullable();
      t.timestamp("nextReminderDate").notNullable();
      t.timestamps(true, true, true);
      t.unique("secretId");
    });
  }

  if (!(await knex.schema.hasTable(TableName.ReminderRecipient))) {
    await knex.schema.createTable(TableName.ReminderRecipient, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("reminderId").notNullable();
      t.foreign("reminderId").references("id").inTable(TableName.Reminder).onDelete("CASCADE");
      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.timestamps(true, true, true);
      t.index("reminderId");
      t.index("userId");
      t.unique(["reminderId", "userId"]);
    });
  }

  await createOnUpdateTrigger(knex, TableName.Reminder);
  await createOnUpdateTrigger(knex, TableName.ReminderRecipient);
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.Reminder);
  await dropOnUpdateTrigger(knex, TableName.ReminderRecipient);
  await knex.schema.dropTableIfExists(TableName.ReminderRecipient);
  await knex.schema.dropTableIfExists(TableName.Reminder);
}
