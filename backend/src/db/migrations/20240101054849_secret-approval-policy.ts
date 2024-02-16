import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretApprovalPolicy))) {
    await knex.schema.createTable(TableName.SecretApprovalPolicy, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.string("secretPath");
      t.integer("approvals").defaultTo(1).notNullable();
      t.uuid("envId").notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.SecretApprovalPolicy);

  if (!(await knex.schema.hasTable(TableName.SecretApprovalPolicyApprover))) {
    await knex.schema.createTable(TableName.SecretApprovalPolicyApprover, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("approverId").notNullable();
      t.foreign("approverId").references("id").inTable(TableName.ProjectMembership).onDelete("CASCADE");
      t.uuid("policyId").notNullable();
      t.foreign("policyId").references("id").inTable(TableName.SecretApprovalPolicy).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.SecretApprovalPolicyApprover);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SecretApprovalPolicyApprover);
  await knex.schema.dropTableIfExists(TableName.SecretApprovalPolicy);
  await dropOnUpdateTrigger(knex, TableName.SecretApprovalPolicyApprover);
  await dropOnUpdateTrigger(knex, TableName.SecretApprovalPolicy);
}
