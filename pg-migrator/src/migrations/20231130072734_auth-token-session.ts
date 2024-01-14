import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const isTablePresent = await knex.schema.hasTable(TableName.AuthTokenSession);
  if (!isTablePresent) {
    await knex.schema.createTable(TableName.AuthTokenSession, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("ip").notNullable();
      t.string("userAgent");
      t.integer("refreshVersion").notNullable().defaultTo(1);
      t.integer("accessVersion").notNullable().defaultTo(1);
      t.datetime("lastUsed").notNullable();
      // does not need update trigger we will do it manually
      t.timestamps(true, true, true);
      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
    });
  }
  // this is a one time function
  await createOnUpdateTrigger(knex, TableName.AuthTokenSession);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.AuthTokenSession);
  await dropOnUpdateTrigger(knex, TableName.AuthTokenSession);
}
