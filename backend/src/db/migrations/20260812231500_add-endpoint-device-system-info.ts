import { Knex } from "knex";

import { TableName } from "../schemas";

// What the machine is, as the agent on it reports. Every column is nullable: a device that has never
// run the agent has none of it, and a platform that cannot answer one field still reports the rest.
const SYSTEM_INFO_COLUMNS = [
  "hostname",
  "platform",
  "arch",
  "osName",
  "osVersion",
  "osBuild",
  "modelIdentifier",
  "cpuModel",
  "serialNumber",
  "ipAddress"
] as const;

export async function up(knex: Knex): Promise<void> {
  const hasHostname = await knex.schema.hasColumn(TableName.EndpointDevice, "hostname");
  if (hasHostname) return;

  await knex.schema.alterTable(TableName.EndpointDevice, (t) => {
    SYSTEM_INFO_COLUMNS.forEach((column) => {
      t.string(column);
    });

    t.integer("cpuCores");
    t.bigint("memoryBytes");
    // When the machine last booted, not when the agent started: uptime is a property of the device.
    t.datetime("bootedAt");
    t.datetime("systemInfoReportedAt");
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasHostname = await knex.schema.hasColumn(TableName.EndpointDevice, "hostname");
  if (!hasHostname) return;

  await knex.schema.alterTable(TableName.EndpointDevice, (t) => {
    t.dropColumns(...SYSTEM_INFO_COLUMNS, "cpuCores", "memoryBytes", "bootedAt", "systemInfoReportedAt");
  });
}
