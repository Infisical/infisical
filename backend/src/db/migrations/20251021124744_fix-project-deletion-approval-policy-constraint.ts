import { Knex } from "knex";

import { TableName } from "../schemas";

// Fix for 20250722152841_add-policies-environments-table.ts migration.
// 20250722152841_add-policies-environments-table.ts introduced a bug where you can no longer delete a project if it has any approval policy environments.

export async function up(knex: Knex): Promise<void> {
  // Fix SecretApprovalPolicyEnvironment to cascade delete when environment is deleted
  // note: this won't actually happen, as we prevent deletion of environments with active approval policies

  // in the old migration it was ON DELETE SET NULL, which doesn't work because envId is not a nullable col
  await knex.schema.alterTable(TableName.SecretApprovalPolicyEnvironment, (t) => {
    t.dropForeign(["envId"]);
    t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
  });

  // Fix AccessApprovalPolicyEnvironment to cascade delete when environment is deleted
  // note: this won't actually happen, as we prevent deletion of environments with active approval policies

  // in the old migration it was ON DELETE SET NULL, which doesn't work because envId is not a nullable col
  await knex.schema.alterTable(TableName.AccessApprovalPolicyEnvironment, (t) => {
    t.dropForeign(["envId"]);
    t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
  });

  // Fix SecretApprovalPolicy to CASCADE instead of SET NULL

  // in the old migration it was ON DELETE SET NULL, which doesn't work because envId is not a nullable col
  await knex.schema.alterTable(TableName.SecretApprovalPolicy, (t) => {
    t.dropForeign(["envId"]);
    t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
  });

  // Fix AccessApprovalPolicy to CASCADE instead of SET NULL

  // in the old migration it was ON DELETE SET NULL, which doesn't work because envId is not a nullable col
  await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
    t.dropForeign(["envId"]);
    t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
  });
}

export async function down(knex: Knex): Promise<void> {
  // Revert SecretApprovalPolicyEnvironment
  await knex.schema.alterTable(TableName.SecretApprovalPolicyEnvironment, (t) => {
    t.dropForeign(["envId"]);
    t.foreign("envId").references("id").inTable(TableName.Environment);
  });

  // Revert AccessApprovalPolicyEnvironment
  await knex.schema.alterTable(TableName.AccessApprovalPolicyEnvironment, (t) => {
    t.dropForeign(["envId"]);
    t.foreign("envId").references("id").inTable(TableName.Environment);
  });

  // Revert SecretApprovalPolicy back to SET NULL
  await knex.schema.alterTable(TableName.SecretApprovalPolicy, (t) => {
    t.dropForeign(["envId"]);
    t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("SET NULL");
  });

  // Revert AccessApprovalPolicy back to SET NULL
  await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
    t.dropForeign(["envId"]);
    t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("SET NULL");
  });
}
