import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const isTablePresent = await knex.schema.hasTable(TableName.AuthTokens);
  if (!isTablePresent) {
    await knex.schema.createTable(TableName.AuthTokens, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("type").notNullable();
      t.string("phoneNumber");
      t.string("tokenHash").notNullable();
      t.integer("triesLeft");
      t.datetime("expiresAt").notNullable();
      // does not need update trigger we will do it manually
      t.timestamps(true, true, true);
      t.uuid("userId");
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.AuthTokens);
}
