import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.OauthClient))) {
    await knex.schema.createTable(TableName.OauthClient, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.string("name").notNullable();
      t.text("description");
      t.string("clientId").notNullable().unique();
      t.string("clientSecretHash").notNullable();
      t.string("clientSecretPrefix").notNullable();
      t.specificType("redirectUris", "text[]").notNullable();
      t.boolean("requirePkce").notNullable().defaultTo(false);
      t.timestamps(true, true, true);
      t.index(["orgId"]);
    });

    await createOnUpdateTrigger(knex, TableName.OauthClient);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.OauthClient);
  await dropOnUpdateTrigger(knex, TableName.OauthClient);
}
