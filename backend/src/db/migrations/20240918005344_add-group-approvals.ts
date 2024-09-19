import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AccessApprovalPolicyGroupApprover))) {
    await knex.schema.createTable(TableName.AccessApprovalPolicyGroupApprover, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("approverGroupId").notNullable();
      t.foreign("approverGroupId").references("id").inTable(TableName.Groups).onDelete("CASCADE");
      t.uuid("policyId").notNullable();
      t.foreign("policyId").references("id").inTable(TableName.AccessApprovalPolicy).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.AccessApprovalPolicyGroupApprover);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.AccessApprovalPolicyGroupApprover);
}
