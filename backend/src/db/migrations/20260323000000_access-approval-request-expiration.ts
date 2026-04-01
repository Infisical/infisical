import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasPolicyExpirationColumn = await knex.schema.hasColumn(
    TableName.AccessApprovalPolicy,
    "requestExpirationTime"
  );
  if (!hasPolicyExpirationColumn) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
      t.string("requestExpirationTime").nullable();
    });
  }

  const hasRequestExpiresAtColumn = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "expiresAt");
  if (!hasRequestExpiresAtColumn) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
      t.timestamp("expiresAt", { useTz: true }).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasPolicyExpirationColumn = await knex.schema.hasColumn(
    TableName.AccessApprovalPolicy,
    "requestExpirationTime"
  );
  if (hasPolicyExpirationColumn) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
      t.dropColumn("requestExpirationTime");
    });
  }

  const hasRequestExpiresAtColumn = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "expiresAt");
  if (hasRequestExpiresAtColumn) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
      t.dropColumn("expiresAt");
    });
  }
}
