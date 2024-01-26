import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const isTablePresent = await knex.schema.hasTable(TableName.ApiKey);
  if (!isTablePresent) {
    await knex.schema.createTable(TableName.ApiKey, (t) => {
      t.string("id", 36).primary().defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.datetime("lastUsed");
      t.datetime("expiresAt");
      t.string("secretHash").notNullable();
      t.timestamps(true, true, true);
      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
    });
  }
  await createOnUpdateTrigger(knex, TableName.ApiKey);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ApiKey);
  await dropOnUpdateTrigger(knex, TableName.ApiKey);
}
