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
      t.string("slug").notNullable();
      // does not need update trigger we will do it manually
      t.unique("slug");
      t.timestamps(true, true, true);
    });
    await knex.schema.alterTable(TableName.AuthTokens, (t) => {
      t.uuid("orgId");
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
    });
  }
  // this is a one time function
  await createOnUpdateTrigger(knex, TableName.Organization);
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.AuthTokens, "orgId")) {
    await knex.schema.alterTable(TableName.AuthTokens, (t) => {
      t.dropColumn("orgId");
    });
  }
  await knex.schema.dropTableIfExists(TableName.Organization);
  await dropOnUpdateTrigger(knex, TableName.Organization);
}
