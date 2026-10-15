import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ExternalApprovalPolicies))) {
    await knex.schema.createTable(TableName.ExternalApprovalPolicies, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("policyId").notNullable().unique();
      t.foreign("policyId").references("id").inTable(TableName.ApprovalPolicies).onDelete("CASCADE");

      t.string("type", 50).notNullable();

      t.uuid("connectionId").notNullable().index();
      t.foreign("connectionId").references("id").inTable(TableName.AppConnection).deferrable("deferred");

      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.ExternalApprovalPolicies);
  }

  if (!(await knex.schema.hasTable(TableName.ExternalApprovalRequests))) {
    await knex.schema.createTable(TableName.ExternalApprovalRequests, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("requestId").notNullable().unique();
      t.foreign("requestId").references("id").inTable(TableName.ApprovalRequests).onDelete("CASCADE");

      t.string("status", 50).notNullable();
      t.binary("callbackTokenHash").nullable().unique();
      t.text("statusReason").nullable();

      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.ExternalApprovalRequests);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.ExternalApprovalRequests);
  await knex.schema.dropTableIfExists(TableName.ExternalApprovalRequests);

  await dropOnUpdateTrigger(knex, TableName.ExternalApprovalPolicies);
  await knex.schema.dropTableIfExists(TableName.ExternalApprovalPolicies);
}
