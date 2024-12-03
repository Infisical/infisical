import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasAccessApprovalPolicyDisabledColumn = await knex.schema.hasColumn(TableName.AccessApprovalPolicy, "disabled");
  const hasSecretApprovalPolicyDisabledColumn = await knex.schema.hasColumn(TableName.SecretApprovalPolicy, "disabled");

  if (!hasAccessApprovalPolicyDisabledColumn) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
      t.boolean("disabled").defaultTo(false).notNullable();
    });
  }
  if (!hasSecretApprovalPolicyDisabledColumn) {
    await knex.schema.alterTable(TableName.SecretApprovalPolicy, (t) => {
      t.boolean("disabled").defaultTo(false).notNullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasAccessApprovalPolicyDisabledColumn = await knex.schema.hasColumn(TableName.AccessApprovalPolicy, "disabled");
  const hasSecretApprovalPolicyDisabledColumn = await knex.schema.hasColumn(TableName.SecretApprovalPolicy, "disabled");

  if (hasAccessApprovalPolicyDisabledColumn) {
    await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
      t.dropColumn("disabled");
    });
  }
  if (hasSecretApprovalPolicyDisabledColumn) {
    await knex.schema.alterTable(TableName.SecretApprovalPolicy, (t) => {
      t.dropColumn("disabled");
    });
  }
}
