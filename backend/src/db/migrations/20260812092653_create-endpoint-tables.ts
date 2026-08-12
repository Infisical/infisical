import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.EndpointDevice))) {
    await knex.schema.createTable(TableName.EndpointDevice, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      // A device is a company machine belonging to a person, and the agent on it authenticates as
      // that person. So the owner is the device's identity, not a separate credential.
      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.index("userId");

      t.string("name").notNullable();
      t.string("status").notNullable();
      t.datetime("lastSeenAt");
      t.string("agentVersion");
      t.integer("configVersion").notNullable().defaultTo(1);
      t.boolean("pfEnabled");
      t.jsonb("blockedAddresses");

      t.unique(["projectId", "userId"]);

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.EndpointDevice);
  }

  if (!(await knex.schema.hasTable(TableName.EndpointEgressRule))) {
    await knex.schema.createTable(TableName.EndpointEgressRule, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      t.string("ruleType").notNullable();
      t.string("action");
      t.string("kind").notNullable();
      t.string("destination").notNullable();
      t.bigint("thresholdBytes");
      t.string("name").notNullable();
      t.boolean("isEnabled").notNullable().defaultTo(true);

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.EndpointEgressRule);
  }

  if (!(await knex.schema.hasTable(TableName.EndpointCounter))) {
    await knex.schema.createTable(TableName.EndpointCounter, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("deviceId").notNullable();
      t.foreign("deviceId").references("id").inTable(TableName.EndpointDevice).onDelete("CASCADE");
      t.index("deviceId");

      t.uuid("egressRuleId").notNullable();
      t.foreign("egressRuleId").references("id").inTable(TableName.EndpointEgressRule).onDelete("CASCADE");
      t.index("egressRuleId");

      t.string("destination").notNullable();
      t.bigint("bytesOut").notNullable().defaultTo(0);
      t.bigint("thresholdBytes");
      t.boolean("tripped").notNullable().defaultTo(false);
      t.datetime("reportedAt").notNullable();

      t.unique(["deviceId", "egressRuleId"]);

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.EndpointCounter);
  }

  if (!(await knex.schema.hasTable(TableName.EndpointEvent))) {
    await knex.schema.createTable(TableName.EndpointEvent, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      t.uuid("deviceId").notNullable();
      t.foreign("deviceId").references("id").inTable(TableName.EndpointDevice).onDelete("CASCADE");
      t.index("deviceId");

      t.string("eventType").notNullable();
      t.datetime("occurredAt").notNullable();
      t.string("destination");

      t.uuid("egressRuleId");
      t.foreign("egressRuleId").references("id").inTable(TableName.EndpointEgressRule).onDelete("SET NULL");
      t.index("egressRuleId");

      t.jsonb("detail");
      t.string("idempotencyKey").notNullable();
      t.unique("idempotencyKey");

      t.index(["projectId", "occurredAt"]);

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.EndpointEvent);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.EndpointEvent);
  await dropOnUpdateTrigger(knex, TableName.EndpointEvent);

  await knex.schema.dropTableIfExists(TableName.EndpointCounter);
  await dropOnUpdateTrigger(knex, TableName.EndpointCounter);

  await knex.schema.dropTableIfExists(TableName.EndpointEgressRule);
  await dropOnUpdateTrigger(knex, TableName.EndpointEgressRule);

  await knex.schema.dropTableIfExists(TableName.EndpointDevice);
  await dropOnUpdateTrigger(knex, TableName.EndpointDevice);
}
