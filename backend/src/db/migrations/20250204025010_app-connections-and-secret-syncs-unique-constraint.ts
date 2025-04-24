import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.AppConnection, (t) => {
    t.unique(["orgId", "name"]);
  });

  await knex.schema.alterTable(TableName.SecretSync, (t) => {
    t.unique(["projectId", "name"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.AppConnection, (t) => {
    t.dropUnique(["orgId", "name"]);
  });

  await knex.schema.alterTable(TableName.SecretSync, (t) => {
    t.dropUnique(["projectId", "name"]);
  });
}
