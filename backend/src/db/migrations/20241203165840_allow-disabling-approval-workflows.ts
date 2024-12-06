import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasAccessApprovalPolicyDeletedAtColumn = await knex.schema.hasColumn(
    TableName.AccessApprovalPolicy,
    "deletedAt"
  );
  const hasSecretApprovalPolicyDeletedAtColumn = await knex.schema.hasColumn(
    TableName.SecretApprovalPolicy,
    "deletedAt"
  );

  if (!hasAccessApprovalPolicyDeletedAtColumn) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
      t.timestamp("deletedAt");
    });
  }
  if (!hasSecretApprovalPolicyDeletedAtColumn) {
    await knex.schema.alterTable(TableName.SecretApprovalPolicy, (t) => {
      t.timestamp("deletedAt");
    });
  }

  await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
    t.dropForeign(["privilegeId"]);

    // Add the new foreign key constraint with ON DELETE SET NULL
    t.foreign("privilegeId").references("id").inTable(TableName.ProjectUserAdditionalPrivilege).onDelete("SET NULL");
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasAccessApprovalPolicyDeletedAtColumn = await knex.schema.hasColumn(
    TableName.AccessApprovalPolicy,
    "deletedAt"
  );
  const hasSecretApprovalPolicyDeletedAtColumn = await knex.schema.hasColumn(
    TableName.SecretApprovalPolicy,
    "deletedAt"
  );

  if (hasAccessApprovalPolicyDeletedAtColumn) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
      t.dropColumn("deletedAt");
    });
  }
  if (hasSecretApprovalPolicyDeletedAtColumn) {
    await knex.schema.alterTable(TableName.SecretApprovalPolicy, (t) => {
      t.dropColumn("deletedAt");
    });
  }

  await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
    t.dropForeign(["privilegeId"]);
    t.foreign("privilegeId").references("id").inTable(TableName.ProjectUserAdditionalPrivilege).onDelete("CASCADE");
  });
}
