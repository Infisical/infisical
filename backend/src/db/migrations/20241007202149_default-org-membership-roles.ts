import { Knex } from "knex";

import { TableName } from "@app/db/schemas";

export async function up(knex: Knex): Promise<void> {
  // org default role
  if (await knex.schema.hasTable(TableName.Organization)) {
    const hasDefaultRoleCol = await knex.schema.hasColumn(TableName.Organization, "defaultMembershipRole");

    if (!hasDefaultRoleCol) {
      await knex.schema.alterTable(TableName.Organization, (tb) => {
        tb.string("defaultMembershipRole").notNullable().defaultTo("member");
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // org default role
  if (await knex.schema.hasTable(TableName.Organization)) {
    const hasDefaultRoleCol = await knex.schema.hasColumn(TableName.Organization, "defaultMembershipRole");

    if (hasDefaultRoleCol) {
      await knex.schema.alterTable(TableName.Organization, (tb) => {
        tb.dropColumn("defaultMembershipRole");
      });
    }
  }
}
