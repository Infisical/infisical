import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasManageGroupMembershipsCol = await knex.schema.hasColumn(TableName.OidcConfig, "manageGroupMemberships");

  await knex.schema.alterTable(TableName.OidcConfig, (tb) => {
    if (!hasManageGroupMembershipsCol) {
      tb.boolean("manageGroupMemberships").notNullable().defaultTo(false);
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasManageGroupMembershipsCol = await knex.schema.hasColumn(TableName.OidcConfig, "manageGroupMemberships");

  await knex.schema.alterTable(TableName.OidcConfig, (t) => {
    if (hasManageGroupMembershipsCol) {
      t.dropColumn("manageGroupMemberships");
    }
  });
}
