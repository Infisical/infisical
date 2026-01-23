import { Knex } from "knex";

import { dropConstraintIfExists } from "@app/db/migrations/utils/dropConstraintIfExists";
import { TableName } from "@app/db/schemas/models";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.AppConnection, (t) => {
    t.unique(["orgId", "name"]);
  });

  await knex.schema.alterTable(TableName.SecretSync, (t) => {
    t.unique(["projectId", "name"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await dropConstraintIfExists(TableName.AppConnection, "app_connections_orgid_name_unique", knex);

  await knex.schema.alterTable(TableName.SecretSync, (t) => {
    t.dropUnique(["projectId", "name"]);
  });
}
