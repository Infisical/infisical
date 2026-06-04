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
      t.string("appId").notNullable();
      t.string("clientId").notNullable();
      t.binary("encryptedClientSecret").notNullable();
      t.binary("encryptedPrivateKey").notNullable();
      t.string("slug").notNullable();
      t.string("owner").nullable();
      t.string("host").nullable();
      t.string("instanceType").notNullable().defaultTo("cloud");
      t.timestamps(true, true, true);
      t.unique(["orgId", "name"]);
    });

    await createOnUpdateTrigger(knex, TableName.GitHubApp);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.GitHubApp);
  await knex.schema.dropTableIfExists(TableName.GitHubApp);
}
