import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const existingSecretApprovalPolicies = await knex(TableName.SecretApprovalPolicy)
    .whereNull("secretPath")
    .orWhere("secretPath", "");

  const existingAccessApprovalPolicies = await knex(TableName.AccessApprovalPolicy)
    .whereNull("secretPath")
    .orWhere("secretPath", "");

  // update all the secret approval policies secretPath to be "/**"
  if (existingSecretApprovalPolicies.length) {
    await knex(TableName.SecretApprovalPolicy)
      .whereIn(
        "id",
        existingSecretApprovalPolicies.map((el) => el.id)
      )
      .update({
        secretPath: "/**"
      });
  }

  // update all the access approval policies secretPath to be "/**"
  if (existingAccessApprovalPolicies.length) {
    await knex(TableName.AccessApprovalPolicy)
      .whereIn(
        "id",
        existingAccessApprovalPolicies.map((el) => el.id)
      )
      .update({
        secretPath: "/**"
      });
  }

  await knex.schema.alterTable(TableName.SecretApprovalPolicy, (table) => {
    table.string("secretPath").notNullable().alter();
  });

  await knex.schema.alterTable(TableName.AccessApprovalPolicy, (table) => {
    table.string("secretPath").notNullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.SecretApprovalPolicy, (table) => {
    table.string("secretPath").nullable().alter();
  });

  await knex.schema.alterTable(TableName.AccessApprovalPolicy, (table) => {
    table.string("secretPath").nullable().alter();
  });
}
