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

  if (!(await knex.schema.hasTable(TableName.EndpointNetworkRule))) {
    await knex.schema.createTable(TableName.EndpointNetworkRule, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      t.string("ruleType").notNullable();
      t.string("action");

      // A destination rule names where it applies. A volume rule deliberately does not: it means
      // "block any destination this device sends more than thresholdBytes to", and the destinations
      // are discovered from the device's own traffic. So both columns are nullable and which ones a
      // row must carry depends on ruleType.
      t.string("kind");
      t.string("destination");

      // A volume rule's threshold is a rate, not a lifetime total: thresholdBytes within
      // windowSeconds. Measured cumulatively, uptime alone would eventually trip any rule against a
      // destination the device uses legitimately.
      t.bigint("thresholdBytes");
      t.integer("windowSeconds");
      t.string("name").notNullable();
      t.boolean("isEnabled").notNullable().defaultTo(true);

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.EndpointNetworkRule);
  }

  if (!(await knex.schema.hasTable(TableName.EndpointCounter))) {
    await knex.schema.createTable(TableName.EndpointCounter, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("deviceId").notNullable();
      t.foreign("deviceId").references("id").inTable(TableName.EndpointDevice).onDelete("CASCADE");
      t.index("deviceId");

      t.uuid("networkRuleId").notNullable();
      t.foreign("networkRuleId").references("id").inTable(TableName.EndpointNetworkRule).onDelete("CASCADE");
      t.index("networkRuleId");

      t.string("destination").notNullable();
      t.bigint("bytesOut").notNullable().defaultTo(0);
      t.bigint("thresholdBytes");
      t.boolean("tripped").notNullable().defaultTo(false);
      t.datetime("reportedAt").notNullable();

      // One volume rule produces a counter per destination the device is measured against, so the
      // destination is part of what makes a counter unique.
      t.unique(["deviceId", "networkRuleId", "destination"]);

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

      t.uuid("networkRuleId");
      t.foreign("networkRuleId").references("id").inTable(TableName.EndpointNetworkRule).onDelete("SET NULL");
      t.index("networkRuleId");

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

  await knex.schema.dropTableIfExists(TableName.EndpointNetworkRule);
  await dropOnUpdateTrigger(knex, TableName.EndpointNetworkRule);

  await knex.schema.dropTableIfExists(TableName.EndpointDevice);
  await dropOnUpdateTrigger(knex, TableName.EndpointDevice);
}
