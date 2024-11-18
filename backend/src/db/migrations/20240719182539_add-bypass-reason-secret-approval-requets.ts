import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.SecretApprovalRequest, "bypassReason");
  if (!hasColumn) {
    await knex.schema.table(TableName.SecretApprovalRequest, (table) => {
      table.string("bypassReason").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.SecretApprovalRequest, "bypassReason");
  if (hasColumn) {
    await knex.schema.table(TableName.SecretApprovalRequest, (table) => {
      table.dropColumn("bypassReason");
    });
  }
}
