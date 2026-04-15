import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  // Make identityId nullable and add tokenVersion to support enrollment-token-based gateways
  await knex.schema.alterTable(TableName.GatewayV2, (t) => {
    t.uuid("identityId").nullable().alter();
    t.integer("tokenVersion").notNullable().defaultTo(1);
  });

  if (!(await knex.schema.hasTable(TableName.GatewayEnrollmentTokens))) {
    await knex.schema.createTable(TableName.GatewayEnrollmentTokens, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.string("tokenHash", 128).notNullable().unique();
      t.integer("ttl").notNullable().defaultTo(3600);
      t.timestamp("expiresAt").notNullable();
      t.timestamp("usedAt").nullable();
      // When set, enrolling with this token updates the existing gateway instead of creating a new one
      t.uuid("gatewayId").nullable();
      t.foreign("gatewayId").references("id").inTable(TableName.GatewayV2).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.GatewayEnrollmentTokens);
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, TableName.GatewayEnrollmentTokens);
  await knex.schema.dropTableIfExists(TableName.GatewayEnrollmentTokens);

  // Restore identityId to not-null and remove tokenVersion (only safe if no null rows exist)
  await knex.schema.alterTable(TableName.GatewayV2, (t) => {
    t.uuid("identityId").notNullable().alter();
    t.dropColumn("tokenVersion");
  });
}
