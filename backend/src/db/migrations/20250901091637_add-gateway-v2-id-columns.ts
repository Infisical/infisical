import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.DynamicSecret, "gatewayV2Id"))) {
    await knex.schema.alterTable(TableName.DynamicSecret, (table) => {
      table.uuid("gatewayV2Id");
      table.foreign("gatewayV2Id").references("id").inTable(TableName.GatewayV2).onDelete("SET NULL");
    });
  }

  if (!(await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "gatewayV2Id"))) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (table) => {
      table.uuid("gatewayV2Id");
      table.foreign("gatewayV2Id").references("id").inTable(TableName.GatewayV2).onDelete("SET NULL");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.DynamicSecret, "gatewayV2Id")) {
    await knex.schema.alterTable(TableName.DynamicSecret, (table) => {
      table.dropColumn("gatewayV2Id");
    });
  }

  if (await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "gatewayV2Id")) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (table) => {
      table.dropColumn("gatewayV2Id");
    });
  }
}
