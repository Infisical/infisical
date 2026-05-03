import { Knex } from "knex";

import { TableName } from "../schemas";

// Pin the resolved gateway to the session so pool-backed sessions use a stable gateway throughout their lifetime.
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.PamSession, "gatewayId");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.PamSession, (t) => {
      t.uuid("gatewayId").nullable();
      t.foreign("gatewayId").references("id").inTable(TableName.GatewayV2).onDelete("SET NULL");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.PamSession, "gatewayId");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.PamSession, (t) => {
      t.dropColumn("gatewayId");
    });
  }
}
