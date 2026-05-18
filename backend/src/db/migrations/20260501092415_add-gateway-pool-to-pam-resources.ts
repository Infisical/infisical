import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.PamResource, "gatewayPoolId");
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.PamResource, (t) => {
      t.uuid("gatewayPoolId").nullable();
      t.foreign("gatewayPoolId").references("id").inTable(TableName.GatewayPool).onDelete("RESTRICT");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.PamResource, "gatewayPoolId");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.PamResource, (t) => {
      t.dropColumn("gatewayPoolId");
    });
  }
}
