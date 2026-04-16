import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  // Create gateway_pools table
  if (!(await knex.schema.hasTable(TableName.GatewayPool))) {
    await knex.schema.createTable(TableName.GatewayPool, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.string("name", 255).notNullable();
      t.timestamps(true, true, true);
      t.unique(["orgId", "name"]);
    });

    await createOnUpdateTrigger(knex, TableName.GatewayPool);
  }

  // Create gateway_pool_memberships join table
  if (!(await knex.schema.hasTable(TableName.GatewayPoolMembership))) {
    await knex.schema.createTable(TableName.GatewayPoolMembership, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("gatewayPoolId").notNullable();
      t.foreign("gatewayPoolId").references("id").inTable(TableName.GatewayPool).onDelete("CASCADE");
      t.uuid("gatewayId").notNullable();
      t.foreign("gatewayId").references("id").inTable(TableName.GatewayV2).onDelete("CASCADE");
      t.timestamps(true, true, true);
      t.unique(["gatewayPoolId", "gatewayId"]);
    });

    await createOnUpdateTrigger(knex, TableName.GatewayPoolMembership);
  }

  // Add gatewayPoolId to identity_kubernetes_auths
  const hasGatewayPoolId = await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "gatewayPoolId");
  if (!hasGatewayPoolId) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (t) => {
      t.uuid("gatewayPoolId").nullable();
      t.foreign("gatewayPoolId").references("id").inTable(TableName.GatewayPool).onDelete("SET NULL");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Remove gatewayPoolId from identity_kubernetes_auths
  const hasGatewayPoolId = await knex.schema.hasColumn(TableName.IdentityKubernetesAuth, "gatewayPoolId");
  if (hasGatewayPoolId) {
    await knex.schema.alterTable(TableName.IdentityKubernetesAuth, (t) => {
      t.dropColumn("gatewayPoolId");
    });
  }

  await dropOnUpdateTrigger(knex, TableName.GatewayPoolMembership);
  await knex.schema.dropTableIfExists(TableName.GatewayPoolMembership);

  await dropOnUpdateTrigger(knex, TableName.GatewayPool);
  await knex.schema.dropTableIfExists(TableName.GatewayPool);
}
