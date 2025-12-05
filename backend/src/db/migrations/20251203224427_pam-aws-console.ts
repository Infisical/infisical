import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasGatewayId = await knex.schema.hasColumn(TableName.PamResource, "gatewayId");
  if (hasGatewayId) {
    await knex.schema.alterTable(TableName.PamResource, (t) => {
      t.uuid("gatewayId").nullable().alter();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasGatewayId = await knex.schema.hasColumn(TableName.PamResource, "gatewayId");
  if (hasGatewayId) {
    await knex.schema.alterTable(TableName.PamResource, (t) => {
      t.uuid("gatewayId").notNullable().alter();
    });
  }
}
