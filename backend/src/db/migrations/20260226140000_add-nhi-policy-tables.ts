import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.NhiPolicy))) {
    await knex.schema.createTable(TableName.NhiPolicy, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("name").notNullable();
      t.string("description").nullable();
      t.boolean("isEnabled").notNullable().defaultTo(true);
      t.jsonb("conditionRiskFactors").nullable();
      t.integer("conditionMinRiskScore").nullable();
      t.jsonb("conditionIdentityTypes").nullable();
      t.jsonb("conditionProviders").nullable();
      t.string("actionRemediate").nullable();
      t.boolean("actionFlag").notNullable().defaultTo(false);
      t.datetime("lastTriggeredAt").nullable();
      t.timestamps(true, true, true);
      t.unique(["projectId", "name"]);
    });
    await createOnUpdateTrigger(knex, TableName.NhiPolicy);
  }

  if (!(await knex.schema.hasTable(TableName.NhiPolicyExecution))) {
    await knex.schema.createTable(TableName.NhiPolicyExecution, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("policyId").notNullable();
      t.foreign("policyId").references("id").inTable(TableName.NhiPolicy).onDelete("CASCADE");
      t.uuid("identityId").notNullable();
      t.foreign("identityId").references("id").inTable(TableName.NhiIdentity).onDelete("CASCADE");
      t.uuid("scanId").notNullable();
      t.foreign("scanId").references("id").inTable(TableName.NhiScan).onDelete("CASCADE");
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("actionTaken").notNullable();
      t.uuid("remediationActionId").nullable();
      t.foreign("remediationActionId").references("id").inTable(TableName.NhiRemediationAction).onDelete("SET NULL");
      t.string("status").notNullable();
      t.string("statusMessage").nullable();
      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.NhiPolicyExecution);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.NhiPolicyExecution);
  await dropOnUpdateTrigger(knex, TableName.NhiPolicyExecution);
  await knex.schema.dropTableIfExists(TableName.NhiPolicy);
  await dropOnUpdateTrigger(knex, TableName.NhiPolicy);
}
