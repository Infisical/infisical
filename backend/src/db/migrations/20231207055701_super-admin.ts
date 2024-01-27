import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const isTablePresent = await knex.schema.hasTable(TableName.SuperAdmin);
  if (!isTablePresent) {
    await knex.schema.createTable(TableName.SuperAdmin, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.boolean("initialized").defaultTo(false);
      t.boolean("allowSignUp").defaultTo(true);
      t.timestamps(true, true, true);
    });
  }
  // this is a one time function
  await createOnUpdateTrigger(knex, TableName.SuperAdmin);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SuperAdmin);
  await dropOnUpdateTrigger(knex, TableName.SuperAdmin);
}
