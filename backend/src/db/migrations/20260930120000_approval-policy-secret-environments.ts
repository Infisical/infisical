import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ApprovalPolicySecretEnvironment))) {
    await knex.schema.createTable(TableName.ApprovalPolicySecretEnvironment, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("policyId").notNullable().index();
      t.foreign("policyId").references("id").inTable(TableName.ApprovalPolicies).onDelete("CASCADE");

      t.uuid("envId").notNullable().index();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");

      t.string("secretPath").notNullable();

      t.timestamps(true, true, true);
      t.unique(["policyId", "envId"]);
    });

    await createOnUpdateTrigger(knex, TableName.ApprovalPolicySecretEnvironment);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.ApprovalPolicySecretEnvironment);
  await knex.schema.dropTableIfExists(TableName.ApprovalPolicySecretEnvironment);
}
