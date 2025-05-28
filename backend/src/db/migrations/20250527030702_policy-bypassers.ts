import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AccessApprovalPolicyBypasser))) {
    await knex.schema.createTable(TableName.AccessApprovalPolicyBypasser, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("bypasserGroupId").nullable();
      t.foreign("bypasserGroupId").references("id").inTable(TableName.Groups).onDelete("CASCADE");

      t.uuid("bypasserUserId").nullable();
      t.foreign("bypasserUserId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      t.uuid("policyId").notNullable();
      t.foreign("policyId").references("id").inTable(TableName.AccessApprovalPolicy).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.AccessApprovalPolicyBypasser);
  }

  if (!(await knex.schema.hasTable(TableName.SecretApprovalPolicyBypasser))) {
    await knex.schema.createTable(TableName.SecretApprovalPolicyBypasser, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("bypasserGroupId").nullable();
      t.foreign("bypasserGroupId").references("id").inTable(TableName.Groups).onDelete("CASCADE");

      t.uuid("bypasserUserId").nullable();
      t.foreign("bypasserUserId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      t.uuid("policyId").notNullable();
      t.foreign("policyId").references("id").inTable(TableName.SecretApprovalPolicy).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.SecretApprovalPolicyBypasser);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SecretApprovalPolicyBypasser);
  await knex.schema.dropTableIfExists(TableName.AccessApprovalPolicyBypasser);

  await dropOnUpdateTrigger(knex, TableName.SecretApprovalPolicyBypasser);
  await dropOnUpdateTrigger(knex, TableName.AccessApprovalPolicyBypasser);
}
