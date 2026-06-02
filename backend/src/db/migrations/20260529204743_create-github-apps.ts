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
      t.timestamps(true, true, true);
      // GitHub app names are globally unique, so enforce uniqueness across all orgs
      t.unique(["name"]);
    });

    await createOnUpdateTrigger(knex, TableName.GitHubApp);
  }

  if (!(await knex.schema.hasColumn(TableName.AppConnection, "gitHubAppId"))) {
    await knex.schema.alterTable(TableName.AppConnection, (t) => {
      t.uuid("gitHubAppId").nullable();
      t.foreign("gitHubAppId").references("id").inTable(TableName.GitHubApp).onDelete("SET NULL");
      t.index("gitHubAppId");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.AppConnection, "gitHubAppId")) {
    await knex.schema.alterTable(TableName.AppConnection, (t) => {
      t.dropForeign(["gitHubAppId"]);
      t.dropIndex("gitHubAppId");
      t.dropColumn("gitHubAppId");
    });
  }

  await knex.schema.dropTableIfExists(TableName.GitHubApp);
  await dropOnUpdateTrigger(knex, TableName.GitHubApp);
}
