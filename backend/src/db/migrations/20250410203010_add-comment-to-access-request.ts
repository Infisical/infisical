import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "note");
  if (!hasCol) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
      t.string("note").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "note");
  if (hasCol) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
      t.dropColumn("note");
    });
  }
}
