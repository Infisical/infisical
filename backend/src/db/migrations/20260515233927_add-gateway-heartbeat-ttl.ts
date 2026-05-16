import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.GatewayV2, (t) => {
    t.integer("heartbeatTTL").nullable();
  });

  // Backfill existing gateways with 1800 (old 30-min heartbeat interval)
  // so they don't appear unhealthy before their next heartbeat sets the real value.
  await knex(TableName.GatewayV2).whereNotNull("heartbeat").update({ heartbeatTTL: 1800 });

  if (await knex.schema.hasColumn(TableName.GatewayV2, "lastHealthCheckStatus")) {
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
