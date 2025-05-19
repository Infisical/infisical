import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasGatewayIdColumn = await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "gatewayId");

  if (!hasGatewayIdColumn) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (table) => {
      table.uuid("gatewayId").nullable();
      table.foreign("gatewayId").references("id").inTable(TableName.Gateway).onDelete("SET NULL");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasGatewayIdColumn = await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "gatewayId");

  if (hasGatewayIdColumn) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (table) => {
      table.dropForeign("gatewayId");
      table.dropColumn("gatewayId");
    });
  }
}
