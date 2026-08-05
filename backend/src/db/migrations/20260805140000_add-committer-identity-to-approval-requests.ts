import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.SecretApprovalRequest);
  if (hasTable) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretApprovalRequest, "committerIdentityId");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.SecretApprovalRequest, (tb) => {
        tb.uuid("committerIdentityId").nullable();
        tb.foreign("committerIdentityId").references("id").inTable(TableName.Identity).onDelete("SET NULL");
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.SecretApprovalRequest);
  if (hasTable) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretApprovalRequest, "committerIdentityId");
    if (hasColumn) {
      await knex.schema.alterTable(TableName.SecretApprovalRequest, (tb) => {
        tb.dropColumn("committerIdentityId");
      });
    }
  }
}
