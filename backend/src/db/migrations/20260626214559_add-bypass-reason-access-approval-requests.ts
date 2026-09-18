import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "bypassReason");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (table) => {
      table.text("bypassReason").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "bypassReason");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (table) => {
      table.dropColumn("bypassReason");
    });
  }
}
