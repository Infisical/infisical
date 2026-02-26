import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // Agent policies table
  if (!(await knex.schema.hasTable(TableName.AgentGatePolicies))) {
    await knex.schema.createTable(TableName.AgentGatePolicies, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("agentId", 100).notNullable();
      t.jsonb("selfPolicies").notNullable().defaultTo('{"allowedActions": [], "promptPolicies": []}');
      t.jsonb("inboundPolicies").notNullable().defaultTo("[]");
      t.timestamps(true, true, true);
      t.unique(["projectId", "agentId"]);
    });
  }

  // Agent audit logs table (includes execution tracking)
  if (!(await knex.schema.hasTable(TableName.AgentGateAuditLogs))) {
    await knex.schema.createTable(TableName.AgentGateAuditLogs, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("sessionId", 255);
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.timestamp("timestamp").notNullable();
      t.string("requestingAgentId", 100).notNullable();
      t.string("targetAgentId", 100).notNullable();
      t.string("actionType", 20).notNullable();
      t.string("action", 100).notNullable();
      t.string("result", 20).notNullable();
      t.jsonb("policyEvaluations").notNullable();
      t.jsonb("context");
      t.text("agentReasoning");
      // Execution tracking fields
      t.string("executionStatus", 20);
      t.jsonb("executionResult");
      t.text("executionError");
      t.timestamp("executionStartedAt");
      t.timestamp("executionCompletedAt");
      t.integer("executionDurationMs");
      t.timestamps(true, true, true);
      t.index(["projectId", "timestamp"]);
      t.index(["projectId", "requestingAgentId", "timestamp"]);
      t.index(["projectId", "action", "timestamp"]);
      t.index(["projectId", "result", "timestamp"]);
      t.index(["sessionId"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.AgentGateAuditLogs);
  await knex.schema.dropTableIfExists(TableName.AgentGatePolicies);
}
