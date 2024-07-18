import { Knex } from "knex";

import { EnforcementLevel } from "@app/lib/types";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.SecretApprovalPolicy, "enforcementLevel");
  if (!hasColumn) {
    await knex.schema.table(TableName.SecretApprovalPolicy, (table) => {
      table.string("enforcementLevel", 10).notNullable().defaultTo(EnforcementLevel.Hard);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.SecretApprovalPolicy, "enforcementLevel");
  if (hasColumn) {
    await knex.schema.table(TableName.SecretApprovalPolicy, (table) => {
      table.dropColumn("enforcementLevel");
    });
  }
}
