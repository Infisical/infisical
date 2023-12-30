import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Identity))) {
    await knex.schema.createTable(TableName.Identity, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.string("authMethod");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.Identity);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.Identity);
  await dropOnUpdateTrigger(knex, TableName.Identity);
}
