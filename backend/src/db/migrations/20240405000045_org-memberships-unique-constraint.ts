import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.OrgMembership, (table) => {
    table.unique(["userId", "orgId"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.OrgMembership, (table) => {
    table.dropUnique(["userId", "orgId"]);
  });
}
