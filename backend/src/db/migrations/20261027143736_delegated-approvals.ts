import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.DelegatedApprovalPolicies))) {
    await knex.schema.createTable(TableName.DelegatedApprovalPolicies, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("policyId").notNullable().unique();
      t.foreign("policyId").references("id").inTable(TableName.ApprovalPolicies).onDelete("CASCADE");

      t.string("type", 50).notNullable();

      t.uuid("connectionId").notNullable().index();
      t.foreign("connectionId").references("id").inTable(TableName.AppConnection).deferrable("deferred");

      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.DelegatedApprovalPolicies);
  }

  if (!(await knex.schema.hasTable(TableName.DelegatedApprovalRequests))) {
    await knex.schema.createTable(TableName.DelegatedApprovalRequests, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("requestId").notNullable().unique();
      t.foreign("requestId").references("id").inTable(TableName.ApprovalRequests).onDelete("CASCADE");

      t.string("providerType", 50).notNullable();
      t.string("status", 50).notNullable();
      t.binary("encryptedCallbackToken").nullable();
      t.jsonb("details").notNullable();
      t.string("providerRequestId").nullable();
      t.integer("callbackAttempts").notNullable().defaultTo(0);
      t.timestamp("decisionReadRequestedAt", { useTz: true }).nullable();
      t.uuid("dispatchEventId").notNullable();

      t.timestamps(true, true, true);

      t.unique(["providerRequestId", "providerType"]);
    });
    await createOnUpdateTrigger(knex, TableName.DelegatedApprovalRequests);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.DelegatedApprovalRequests);
  await knex.schema.dropTableIfExists(TableName.DelegatedApprovalRequests);

  await dropOnUpdateTrigger(knex, TableName.DelegatedApprovalPolicies);
  await knex.schema.dropTableIfExists(TableName.DelegatedApprovalPolicies);
}
