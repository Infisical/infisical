import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasDirectAddress = await knex.schema.hasColumn(TableName.GatewayV2, "directAddress");
  const hasDirectHeartbeat = await knex.schema.hasColumn(TableName.GatewayV2, "directHeartbeat");

  await knex.schema.alterTable(TableName.GatewayV2, (table) => {
    if (!hasDirectAddress) {
      table.text("directAddress").nullable();
    }
    if (!hasDirectHeartbeat) {
      table.timestamp("directHeartbeat", { useTz: true }).nullable();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasDirectAddress = await knex.schema.hasColumn(TableName.GatewayV2, "directAddress");
  const hasDirectHeartbeat = await knex.schema.hasColumn(TableName.GatewayV2, "directHeartbeat");

  await knex.schema.alterTable(TableName.GatewayV2, (table) => {
    if (hasDirectAddress) {
      table.dropColumn("directAddress");
    }
    if (hasDirectHeartbeat) {
      table.dropColumn("directHeartbeat");
    }
  });
}
