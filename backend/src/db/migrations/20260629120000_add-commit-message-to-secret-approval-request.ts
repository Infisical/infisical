import { Knex } from "knex";

import { TableName } from "../schemas";

// Stores the commit message a user enters when their secret changes are routed through an approval
// policy, so reviewers can see the intent of the change request.
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.SecretApprovalRequest, "commitMessage");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.SecretApprovalRequest, (table) => {
      table.text("commitMessage").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.SecretApprovalRequest, "commitMessage");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.SecretApprovalRequest, (table) => {
      table.dropColumn("commitMessage");
    });
  }
}
