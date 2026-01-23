import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";

export async function up(knex: Knex): Promise<void> {
  const hasCommitterCol = await knex.schema.hasColumn(TableName.SecretApprovalRequest, "committerUserId");

  if (hasCommitterCol) {
    await knex.schema.alterTable(TableName.SecretApprovalRequest, (tb) => {
      tb.uuid("committerUserId").nullable().alter();
    });
  }

  const hasRequesterCol = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "requestedByUserId");

  if (hasRequesterCol) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (tb) => {
      tb.dropForeign("requestedByUserId");
      tb.foreign("requestedByUserId").references("id").inTable(TableName.Users).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // can't undo committer nullable

  const hasRequesterCol = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "requestedByUserId");

  if (hasRequesterCol) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (tb) => {
      tb.dropForeign("requestedByUserId");
      tb.foreign("requestedByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
    });
  }
}
