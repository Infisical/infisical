import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasGatewayId = await knex.schema.hasColumn(TableName.IdentityAuthTemplate, "gatewayId");
  const hasGatewayV2Id = await knex.schema.hasColumn(TableName.IdentityAuthTemplate, "gatewayV2Id");
  const hasGatewayPoolId = await knex.schema.hasColumn(TableName.IdentityAuthTemplate, "gatewayPoolId");

  if (!hasGatewayId || !hasGatewayV2Id || !hasGatewayPoolId) {
    await knex.schema.alterTable(TableName.IdentityAuthTemplate, (t) => {
      // the gateway a template dials through is a reference, not template data, so it lives in
      // columns rather than the encrypted templateFields blob: ON DELETE SET NULL then keeps it
      // in step with the identical columns on the linked identity rows, which a blob cannot do
      if (!hasGatewayId) {
        t.uuid("gatewayId").nullable();
        t.foreign("gatewayId").references("id").inTable(TableName.Gateway).onDelete("SET NULL");
        t.index("gatewayId");
      }
      if (!hasGatewayV2Id) {
        t.uuid("gatewayV2Id").nullable();
        t.foreign("gatewayV2Id").references("id").inTable(TableName.GatewayV2).onDelete("SET NULL");
        t.index("gatewayV2Id");
      }
      if (!hasGatewayPoolId) {
        t.uuid("gatewayPoolId").nullable();
        t.foreign("gatewayPoolId").references("id").inTable(TableName.GatewayPool).onDelete("SET NULL");
        t.index("gatewayPoolId");
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasGatewayId = await knex.schema.hasColumn(TableName.IdentityAuthTemplate, "gatewayId");
  const hasGatewayV2Id = await knex.schema.hasColumn(TableName.IdentityAuthTemplate, "gatewayV2Id");
  const hasGatewayPoolId = await knex.schema.hasColumn(TableName.IdentityAuthTemplate, "gatewayPoolId");

  if (hasGatewayId || hasGatewayV2Id || hasGatewayPoolId) {
    await knex.schema.alterTable(TableName.IdentityAuthTemplate, (t) => {
      if (hasGatewayId) {
        t.dropForeign(["gatewayId"]);
        t.dropColumn("gatewayId");
      }
      if (hasGatewayV2Id) {
        t.dropForeign(["gatewayV2Id"]);
        t.dropColumn("gatewayV2Id");
      }
      if (hasGatewayPoolId) {
        t.dropForeign(["gatewayPoolId"]);
        t.dropColumn("gatewayPoolId");
      }
    });
  }
}
