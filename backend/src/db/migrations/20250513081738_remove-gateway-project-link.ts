import { Knex } from "knex";

import { TableName } from "../schemas";

// Note(daniel): We aren't dropping tables or columns in this migrations so we can easily rollback if needed.
// In the future we need to drop the projectGatewayId on the dynamic secrets table, and drop the project_gateways table entirely.

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.DynamicSecret, (table) => {
    table.uuid("gatewayId").nullable();
    table.foreign("gatewayId").references("id").inTable(TableName.Gateway).onDelete("SET NULL");

    table.index("gatewayId");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TableName.DynamicSecret, (table) => {
    table.dropForeign("gatewayId");
    table.dropColumn("gatewayId");
    table.dropIndex("gatewayId");
  });
}
