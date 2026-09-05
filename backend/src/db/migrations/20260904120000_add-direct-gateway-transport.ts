import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.GatewayV2, (table) => {
    table.text("directAddress").nullable();
    table.timestamp("directHeartbeat", { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.GatewayV2, (table) => {
    table.dropColumns("directAddress", "directHeartbeat");
  });
}
