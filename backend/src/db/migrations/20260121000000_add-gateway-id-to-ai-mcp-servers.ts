import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AiMcpServer)) {
    const hasGatewayId = await knex.schema.hasColumn(TableName.AiMcpServer, "gatewayId");
    if (!hasGatewayId) {
      await knex.schema.alterTable(TableName.AiMcpServer, (t) => {
        t.uuid("gatewayId").nullable();
        t.foreign("gatewayId").references("id").inTable(TableName.GatewayV2).onDelete("SET NULL");
        t.index("gatewayId");
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.AiMcpServer)) {
    const hasGatewayId = await knex.schema.hasColumn(TableName.AiMcpServer, "gatewayId");
    if (hasGatewayId) {
      await knex.schema.alterTable(TableName.AiMcpServer, (t) => {
        t.dropIndex("gatewayId");
        t.dropColumn("gatewayId");
      });
    }
  }
}
