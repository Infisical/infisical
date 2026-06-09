import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "@app/db/utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.GitHubAppConnection))) {
    await knex.schema.createTable(TableName.GitHubAppConnection, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("appConnectionId").notNullable().unique();
      t.foreign("appConnectionId").references("id").inTable(TableName.AppConnection).onDelete("CASCADE");
      t.uuid("githubAppId").notNullable();
      t.foreign("githubAppId").references("id").inTable(TableName.GitHubApp);
      t.index("githubAppId");
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.GitHubAppConnection);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.GitHubAppConnection);
  await knex.schema.dropTableIfExists(TableName.GitHubAppConnection);
}
