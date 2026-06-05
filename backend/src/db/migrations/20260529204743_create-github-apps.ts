import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

const UNIQUE_NAME_ORG_GITHUB_APP_INDEX = "unique_name_org_github_app";

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
      t.string("projectId").nullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.timestamps(true, true, true);
      t.unique(["orgId", "projectId", "name"]);
    });

    // unique name for org-level apps
    await knex.raw(`
        CREATE UNIQUE INDEX ${UNIQUE_NAME_ORG_GITHUB_APP_INDEX}
        ON ${TableName.GitHubApp} ("orgId", "name")
        WHERE "projectId" IS NULL
      `);

    await createOnUpdateTrigger(knex, TableName.GitHubApp);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.GitHubApp);
  await knex.schema.dropTableIfExists(TableName.GitHubApp);
}
