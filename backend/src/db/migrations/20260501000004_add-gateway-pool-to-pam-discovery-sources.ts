import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  // gatewayId was originally NOT NULL on this table because every discovery
  // source needed a directly-attached gateway. We're loosening that to NULL
  // so a row can instead reference a gateway pool. Application-level
  // validation enforces "exactly one of {gatewayId, gatewayPoolId}".
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

  await knex.schema.alterTable(TableName.PamDiscoverySource, (t) => {
    t.uuid("gatewayId").notNullable().alter();
  });
}
