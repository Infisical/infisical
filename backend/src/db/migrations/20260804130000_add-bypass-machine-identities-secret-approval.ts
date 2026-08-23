import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasSecretApprovalPolicyTable = await knex.schema.hasTable(TableName.SecretApprovalPolicy);
  const hasSecretApprovalRequestTable = await knex.schema.hasTable(TableName.SecretApprovalRequest);

  if (hasSecretApprovalPolicyTable) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretApprovalPolicy, "bypassForMachineIdentities");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.SecretApprovalPolicy, (t) => {
        t.boolean("bypassForMachineIdentities").notNullable().defaultTo(true);
      });
    }
  }

  if (hasSecretApprovalRequestTable) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretApprovalRequest, "committerIdentityId");
    if (!hasColumn) {
      await knex.schema.alterTable(TableName.SecretApprovalRequest, (tb) => {
        tb.uuid("committerIdentityId").nullable();
        tb.foreign("committerIdentityId").references("id").inTable(TableName.Identity).onDelete("SET NULL");

        tb.index("committerIdentityId");
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasSecretApprovalPolicyTable = await knex.schema.hasTable(TableName.SecretApprovalPolicy);
  const hasSecretApprovalRequestTable = await knex.schema.hasTable(TableName.SecretApprovalRequest);

  if (hasSecretApprovalPolicyTable) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretApprovalPolicy, "bypassForMachineIdentities");
    if (hasColumn) {
      await knex.schema.alterTable(TableName.SecretApprovalPolicy, (t) => {
        t.dropColumn("bypassForMachineIdentities");
      });
    }
  }

  if (hasSecretApprovalRequestTable) {
    const hasColumn = await knex.schema.hasColumn(TableName.SecretApprovalRequest, "committerIdentityId");
    if (hasColumn) {
      await knex.schema.alterTable(TableName.SecretApprovalRequest, (tb) => {
        tb.dropColumn("committerIdentityId");
      });
    }
  }
}
