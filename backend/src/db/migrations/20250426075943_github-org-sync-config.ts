import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.GithubOrgSyncConfig);
  if (!hasTable) {
    await knex.schema.createTable(TableName.GithubOrgSyncConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("githubOrgName").notNullable();
      t.boolean("isActive").defaultTo(false);
      t.binary("encryptedGithubOrgAccessToken");
      t.uuid("orgId").notNullable().unique();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.GithubOrgSyncConfig);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.GithubOrgSyncConfig);
  await dropOnUpdateTrigger(knex, TableName.GithubOrgSyncConfig);
}
