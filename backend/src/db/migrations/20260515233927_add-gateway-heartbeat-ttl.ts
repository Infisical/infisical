import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.GatewayV2, "heartbeatTTL"))) {
    await knex.schema.alterTable(TableName.GatewayV2, (t) => {
      t.integer("heartbeatTTL").nullable();
    });
  }

  // Backfill: previously-failed gateways get TTL=0 (unhealthy), others get 1800 (old 30-min interval).
  // Only backfill rows that haven't been set yet to avoid overwriting on re-run.
  if (await knex.schema.hasColumn(TableName.GatewayV2, "lastHealthCheckStatus")) {
    await knex.raw(
      `UPDATE ${TableName.GatewayV2} SET "heartbeatTTL" = CASE WHEN "lastHealthCheckStatus" = 'failed' THEN 0 ELSE 1800 END WHERE "heartbeat" IS NOT NULL AND "heartbeatTTL" IS NULL`
    );

    await knex.schema.alterTable(TableName.GatewayV2, (t) => {
      t.dropColumn("lastHealthCheckStatus");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.GatewayV2, "heartbeatTTL")) {
    await knex.schema.alterTable(TableName.GatewayV2, (t) => {
      t.dropColumn("heartbeatTTL");
    });
  }

  if (!(await knex.schema.hasColumn(TableName.GatewayV2, "lastHealthCheckStatus"))) {
    await knex.schema.alterTable(TableName.GatewayV2, (t) => {
      t.string("lastHealthCheckStatus").nullable();
    });
  }
}
