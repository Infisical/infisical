import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.SecretSync, (t) => {
    t.string("name", 64).notNullable().alter();
  });
  await knex.schema.alterTable(TableName.ProjectTemplates, (t) => {
    t.string("name", 64).notNullable().alter();
  });
  await knex.schema.alterTable(TableName.AppConnection, (t) => {
    t.string("name", 64).notNullable().alter();
  });
  await knex.schema.alterTable(TableName.SecretRotationV2, (t) => {
    t.string("name", 64).notNullable().alter();
  });
}

export async function down(): Promise<void> {
  // No down migration or it will error
}
