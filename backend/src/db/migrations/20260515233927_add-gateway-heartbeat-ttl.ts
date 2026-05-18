import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.GatewayV2, "heartbeatTTL"))) {
    await knex.schema.alterTable(TableName.GatewayV2, (t) => {
      t.integer("heartbeatTTL").nullable();
    });
  }

  await knex(TableName.GatewayV2).whereNotNull("heartbeat").whereNull("heartbeatTTL").update({ heartbeatTTL: 1800 });

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
