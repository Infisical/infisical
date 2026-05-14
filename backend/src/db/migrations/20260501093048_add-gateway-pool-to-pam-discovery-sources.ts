import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // Loosen gatewayId to nullable so a row can reference a gateway pool instead.
  await knex.schema.alterTable(TableName.PamDiscoverySource, (t) => {
    t.uuid("gatewayId").nullable().alter();
  });

  const hasColumn = await knex.schema.hasColumn(TableName.PamDiscoverySource, "gatewayPoolId");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.PamDiscoverySource, (t) => {
      t.uuid("gatewayPoolId").nullable();
      t.foreign("gatewayPoolId").references("id").inTable(TableName.GatewayPool).onDelete("RESTRICT");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.PamDiscoverySource, "gatewayPoolId");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.PamDiscoverySource, (t) => {
      t.dropColumn("gatewayPoolId");
    });
  }
}
