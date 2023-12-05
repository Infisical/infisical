import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const isTablePresent = await knex.schema.hasTable(TableName.Organization);
  if (!isTablePresent) {
    await knex.schema.createTable(TableName.Organization, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.string("customerId");
      // does not need update trigger we will do it manually
      t.timestamps(true, true, true);
    });
  }
  // this is a one time function
  await createOnUpdateTrigger(knex, TableName.Organization);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.Organization);
  await dropOnUpdateTrigger(knex, TableName.Organization);
}
