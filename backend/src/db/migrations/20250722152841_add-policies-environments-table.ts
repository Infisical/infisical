import { Knex } from "knex";

import { selectAllTableCols } from "@app/lib/knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AccessApprovalPolicyEnvironment))) {
    await knex.schema.createTable(TableName.AccessApprovalPolicyEnvironment, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("policyId").notNullable();
      t.foreign("policyId").references("id").inTable(TableName.AccessApprovalPolicy).onDelete("CASCADE");
      t.uuid("envId").notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment);
      t.timestamps(true, true, true);
      t.unique(["policyId", "envId"]);
    });

    await createOnUpdateTrigger(knex, TableName.AccessApprovalPolicyEnvironment);

    const existingAccessApprovalPolicies = await knex(TableName.AccessApprovalPolicy)
      .select(selectAllTableCols(TableName.AccessApprovalPolicy))
      .whereNotNull(`${TableName.AccessApprovalPolicy}.envId`);

    const accessApprovalPolicies = existingAccessApprovalPolicies.map(async (policy) => {
      await knex(TableName.AccessApprovalPolicyEnvironment).insert({
        policyId: policy.id,
        envId: policy.envId
      });
    });

    await Promise.all(accessApprovalPolicies);
  }
  if (!(await knex.schema.hasTable(TableName.SecretApprovalPolicyEnvironment))) {
    await knex.schema.createTable(TableName.SecretApprovalPolicyEnvironment, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("policyId").notNullable();
      t.foreign("policyId").references("id").inTable(TableName.SecretApprovalPolicy).onDelete("CASCADE");
      t.uuid("envId").notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment);
      t.timestamps(true, true, true);
      t.unique(["policyId", "envId"]);
    });

    await createOnUpdateTrigger(knex, TableName.SecretApprovalPolicyEnvironment);

    const existingSecretApprovalPolicies = await knex(TableName.SecretApprovalPolicy)
      .select(selectAllTableCols(TableName.SecretApprovalPolicy))
      .whereNotNull(`${TableName.SecretApprovalPolicy}.envId`);

    const secretApprovalPolicies = existingSecretApprovalPolicies.map(async (policy) => {
      await knex(TableName.SecretApprovalPolicyEnvironment).insert({
        policyId: policy.id,
        envId: policy.envId
      });
    });

    await Promise.all(secretApprovalPolicies);
  }

  await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
    t.dropForeign(["envId"]);

    // Add the new foreign key constraint with ON DELETE SET NULL
    t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("SET NULL");
  });

  await knex.schema.alterTable(TableName.SecretApprovalPolicy, (t) => {
    t.dropForeign(["envId"]);

    // Add the new foreign key constraint with ON DELETE SET NULL
    t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("SET NULL");
  });
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AccessApprovalPolicyEnvironment)) {
    await knex.schema.dropTableIfExists(TableName.AccessApprovalPolicyEnvironment);
    await dropOnUpdateTrigger(knex, TableName.AccessApprovalPolicyEnvironment);
  }
  if (await knex.schema.hasTable(TableName.SecretApprovalPolicyEnvironment)) {
    await knex.schema.dropTableIfExists(TableName.SecretApprovalPolicyEnvironment);
    await dropOnUpdateTrigger(knex, TableName.SecretApprovalPolicyEnvironment);
  }

  await knex.schema.alterTable(TableName.AccessApprovalPolicy, (t) => {
    t.dropForeign(["envId"]);
    t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
  });

  await knex.schema.alterTable(TableName.SecretApprovalPolicy, (t) => {
    t.dropForeign(["envId"]);
    t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
  });
}
