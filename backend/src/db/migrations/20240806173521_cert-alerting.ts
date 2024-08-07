import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Alert))) {
    await knex.schema.createTable(TableName.Alert, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("name").notNullable();
      t.integer("alertBeforeDays").notNullable();
      t.string("recipientEmails").notNullable();
    });
  }

  await createOnUpdateTrigger(knex, TableName.Alert);
}

export async function down(knex: Knex): Promise<void> {
  // certificates
  await knex.schema.dropTableIfExists(TableName.Alert);
  await dropOnUpdateTrigger(knex, TableName.Alert);
}
