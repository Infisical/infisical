import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const hasTokenVersionColumn = await knex.schema.hasColumn(TableName.GatewayV2, "tokenVersion");
  const hasIdentityIdColumn = await knex.schema.hasColumn(TableName.GatewayV2, "identityId");

  // Make identityId nullable and add tokenVersion to support enrollment-token-based gateways
  await knex.schema.alterTable(TableName.GatewayV2, (t) => {
    if (hasIdentityIdColumn) {
      t.uuid("identityId").nullable().alter();
    }
    if (!hasTokenVersionColumn) {
      t.integer("tokenVersion").notNullable().defaultTo(0);
    }
  });

  // Literal table name (not TableName enum) is intentional: migration 20260430143000
  // renames this table to resource_token_auths, so the enum value no longer exists.
  // Don't replace with the enum.
  if (!(await knex.schema.hasTable("gateway_enrollment_tokens"))) {
    await knex.schema.createTable("gateway_enrollment_tokens", (t) => {
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

    await createOnUpdateTrigger(knex, "gateway_enrollment_tokens");
  }
}

export async function down(knex: Knex): Promise<void> {
  await dropOnUpdateTrigger(knex, "gateway_enrollment_tokens");
  await knex.schema.dropTableIfExists("gateway_enrollment_tokens");

  // Restore identityId to not-null and remove tokenVersion (only safe if no null rows exist)
  await knex.schema.alterTable(TableName.GatewayV2, (t) => {
    t.uuid("identityId").notNullable().alter();
    t.dropColumn("tokenVersion");
  });
}
