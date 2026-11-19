import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ApprovalPolicyAutoApprovalInputs))) {
    await knex.schema.createTable(TableName.ApprovalPolicyAutoApprovalInputs, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("policyId").notNullable();
      t.foreign("policyId").references("id").inTable(TableName.ApprovalPolicies).onDelete("CASCADE");

      t.integer("position").notNullable();

      t.uuid("connectionId").notNullable().index();
      t.foreign("connectionId").references("id").inTable(TableName.AppConnection).deferrable("deferred");

      t.string("subject", 64).notNullable();

      t.unique(["policyId", "connectionId", "subject"]);

      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.ApprovalPolicyAutoApprovalInputs);
  }

  if (!(await knex.schema.hasTable(TableName.ApprovalPolicyAutoApprovalRules))) {
    await knex.schema.createTable(TableName.ApprovalPolicyAutoApprovalRules, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("policyId").notNullable().index();
      t.foreign("policyId").references("id").inTable(TableName.ApprovalPolicies).onDelete("CASCADE");

      t.integer("position").notNullable();
      t.string("name", 128).notNullable();

      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.ApprovalPolicyAutoApprovalRules);
  }

  if (!(await knex.schema.hasTable(TableName.ApprovalPolicyAutoApprovalConditions))) {
    await knex.schema.createTable(TableName.ApprovalPolicyAutoApprovalConditions, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("ruleId").notNullable().index();
      t.foreign("ruleId").references("id").inTable(TableName.ApprovalPolicyAutoApprovalRules).onDelete("CASCADE");

      t.integer("position").notNullable();

      t.uuid("inputId").nullable().index();
      t.foreign("inputId").references("id").inTable(TableName.ApprovalPolicyAutoApprovalInputs).deferrable("deferred");

      t.uuid("connectionId").nullable().index();
      t.foreign("connectionId").references("id").inTable(TableName.AppConnection).deferrable("deferred");

      t.string("constraint", 64).notNullable();
      t.jsonb("values").notNullable();

      t.check(
        '("inputId" IS NOT NULL AND "connectionId" IS NULL) OR ("inputId" IS NULL AND "connectionId" IS NOT NULL)'
      );

      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.ApprovalPolicyAutoApprovalConditions);
  }

  if (await knex.schema.hasTable(TableName.ApprovalRequests)) {
    const hasAutoApprovedAt = await knex.schema.hasColumn(TableName.ApprovalRequests, "autoApprovedAt");
    const hasEvidence = await knex.schema.hasColumn(TableName.ApprovalRequests, "autoApprovalEvidence");
    if (!hasAutoApprovedAt || !hasEvidence) {
      await knex.schema.alterTable(TableName.ApprovalRequests, (t) => {
        if (!hasAutoApprovedAt) t.datetime("autoApprovedAt").nullable();
        if (!hasEvidence) t.jsonb("autoApprovalEvidence").nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.ApprovalRequests)) {
    const hasAutoApprovedAt = await knex.schema.hasColumn(TableName.ApprovalRequests, "autoApprovedAt");
    const hasEvidence = await knex.schema.hasColumn(TableName.ApprovalRequests, "autoApprovalEvidence");
    if (hasAutoApprovedAt || hasEvidence) {
      await knex.schema.alterTable(TableName.ApprovalRequests, (t) => {
        if (hasAutoApprovedAt) t.dropColumn("autoApprovedAt");
        if (hasEvidence) t.dropColumn("autoApprovalEvidence");
      });
    }
  }

  await dropOnUpdateTrigger(knex, TableName.ApprovalPolicyAutoApprovalConditions);
  await knex.schema.dropTableIfExists(TableName.ApprovalPolicyAutoApprovalConditions);

  await dropOnUpdateTrigger(knex, TableName.ApprovalPolicyAutoApprovalRules);
  await knex.schema.dropTableIfExists(TableName.ApprovalPolicyAutoApprovalRules);

  await dropOnUpdateTrigger(knex, TableName.ApprovalPolicyAutoApprovalInputs);
  await knex.schema.dropTableIfExists(TableName.ApprovalPolicyAutoApprovalInputs);
}
