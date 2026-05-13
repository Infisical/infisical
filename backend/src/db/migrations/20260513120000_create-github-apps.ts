import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.GitHubApp))) {
    await knex.schema.createTable(TableName.GitHubApp, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.string("name").notNullable();
      t.binary("encryptedAppId").notNullable();
      t.binary("encryptedClientId").notNullable();
      t.binary("encryptedClientSecret").notNullable();
      t.binary("encryptedPrivateKey").notNullable();
      t.binary("encryptedSlug").notNullable();
      t.timestamps(true, true, true);
      t.unique(["orgId", "name"]);
    });

    await createOnUpdateTrigger(knex, TableName.GitHubApp);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.GitHubApp);
  await dropOnUpdateTrigger(knex, TableName.GitHubApp);
}
