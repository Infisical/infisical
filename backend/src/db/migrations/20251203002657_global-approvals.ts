import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.ApprovalPolicies))) {
    await knex.schema.createTable(TableName.ApprovalPolicies, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable().index();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      t.uuid("organizationId").notNullable().index();
      t.foreign("organizationId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      t.string("type").notNullable().index();
      t.string("name").notNullable();

      t.boolean("isActive").defaultTo(true);

      t.integer("maxRequestTtlSeconds").nullable();

      t.jsonb("conditions").notNullable();
      t.jsonb("constraints").notNullable();

      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.ApprovalPolicies);
  }

  if (!(await knex.schema.hasTable(TableName.ApprovalPolicySteps))) {
    await knex.schema.createTable(TableName.ApprovalPolicySteps, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("policyId").notNullable().index();
      t.foreign("policyId").references("id").inTable(TableName.ApprovalPolicies).onDelete("CASCADE");

      t.string("name").nullable();
      t.integer("stepNumber").notNullable();

      t.integer("requiredApprovals").notNullable();
      t.boolean("notifyApprovers").defaultTo(false);
    });
  }

  if (!(await knex.schema.hasTable(TableName.ApprovalPolicyStepApprovers))) {
    await knex.schema.createTable(TableName.ApprovalPolicyStepApprovers, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("policyStepId").notNullable().index();
      t.foreign("policyStepId").references("id").inTable(TableName.ApprovalPolicySteps).onDelete("CASCADE");

      t.uuid("userId").nullable().index();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      t.uuid("groupId").nullable().index();
      t.foreign("groupId").references("id").inTable(TableName.Groups).onDelete("CASCADE");

      t.check('("userId" IS NOT NULL AND "groupId" IS NULL) OR ("userId" IS NULL AND "groupId" IS NOT NULL)');
    });
  }

  if (!(await knex.schema.hasTable(TableName.ApprovalRequests))) {
    await knex.schema.createTable(TableName.ApprovalRequests, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable().index();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      t.uuid("organizationId").notNullable().index();
      t.foreign("organizationId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      t.uuid("policyId").notNullable().index();
      t.foreign("policyId").references("id").inTable(TableName.ApprovalPolicies).onDelete("CASCADE");

      t.uuid("requesterId").notNullable().index();
      t.foreign("requesterId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      // To be used in the event of requester deletion
      t.string("requesterName").notNullable();
      t.string("requesterEmail").notNullable();

      t.string("type").notNullable().index();

      t.string("status").notNullable().index();
      t.text("justification").nullable();
      t.integer("currentStep").notNullable();

      t.jsonb("requestData").notNullable();

      t.timestamp("expiresAt").nullable();
      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.ApprovalRequests);
  }

  if (!(await knex.schema.hasTable(TableName.ApprovalRequestSteps))) {
    await knex.schema.createTable(TableName.ApprovalRequestSteps, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("requestId").notNullable().index();
      t.foreign("requestId").references("id").inTable(TableName.ApprovalRequests).onDelete("CASCADE");

      t.integer("stepNumber").notNullable();

      t.string("name").nullable();
      t.string("status").notNullable().index();

      t.integer("requiredApprovals").notNullable();
      t.boolean("notifyApprovers").defaultTo(false);

      t.timestamp("startedAt").nullable();
      t.timestamp("completedAt").nullable();
    });
  }

  if (!(await knex.schema.hasTable(TableName.ApprovalRequestStepEligibleApprovers))) {
    await knex.schema.createTable(TableName.ApprovalRequestStepEligibleApprovers, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("stepId").notNullable().index();
      t.foreign("stepId").references("id").inTable(TableName.ApprovalRequestSteps).onDelete("CASCADE");

      t.uuid("userId").nullable().index();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      t.uuid("groupId").nullable().index();
      t.foreign("groupId").references("id").inTable(TableName.Groups).onDelete("CASCADE");

      t.check('("userId" IS NOT NULL AND "groupId" IS NULL) OR ("userId" IS NULL AND "groupId" IS NOT NULL)');
    });
  }

  if (!(await knex.schema.hasTable(TableName.ApprovalRequestApprovals))) {
    await knex.schema.createTable(TableName.ApprovalRequestApprovals, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("stepId").notNullable().index();
      t.foreign("stepId").references("id").inTable(TableName.ApprovalRequestSteps).onDelete("CASCADE");

      t.uuid("approverUserId").notNullable().index();
      t.foreign("approverUserId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      t.string("decision").notNullable();
      t.text("comment").nullable();

      t.timestamp("createdAt").defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable(TableName.ApprovalRequestGrants))) {
    await knex.schema.createTable(TableName.ApprovalRequestGrants, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable().index();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      t.uuid("requestId").notNullable().index();
      t.foreign("requestId").references("id").inTable(TableName.ApprovalRequests).onDelete("CASCADE");

      t.uuid("granteeUserId").notNullable().index();
      t.foreign("granteeUserId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      t.uuid("revokedByUserId").nullable().index();
      t.foreign("revokedByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");

      t.text("revocationReason").nullable();

      t.string("status").notNullable().index();
      t.string("type").notNullable().index();

      t.jsonb("attributes").notNullable();

      t.timestamp("createdAt").defaultTo(knex.fn.now());
      t.timestamp("expiresAt").nullable();
      t.timestamp("revokedAt").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ApprovalRequestGrants);
  await knex.schema.dropTableIfExists(TableName.ApprovalRequestApprovals);
  await knex.schema.dropTableIfExists(TableName.ApprovalRequestStepEligibleApprovers);
  await knex.schema.dropTableIfExists(TableName.ApprovalRequestSteps);
  await knex.schema.dropTableIfExists(TableName.ApprovalRequests);
  await knex.schema.dropTableIfExists(TableName.ApprovalPolicyStepApprovers);
  await knex.schema.dropTableIfExists(TableName.ApprovalPolicySteps);
  await knex.schema.dropTableIfExists(TableName.ApprovalPolicies);

  await dropOnUpdateTrigger(knex, TableName.ApprovalRequests);
  await dropOnUpdateTrigger(knex, TableName.ApprovalPolicies);
}
