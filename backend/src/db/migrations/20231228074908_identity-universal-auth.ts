import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.IdentityUniversalAuth))) {
    await knex.schema.createTable(TableName.IdentityUniversalAuth, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("clientId").notNullable();
      t.bigInteger("accessTokenTTL").defaultTo(7200).notNullable();
      t.bigInteger("accessTokenMaxTTL").defaultTo(7200).notNullable();
      t.bigInteger("accessTokenNumUsesLimit").defaultTo(0).notNullable();
      t.jsonb("clientSecretTrustedIps").notNullable();
      t.jsonb("accessTokenTrustedIps").notNullable();
      t.timestamps(true, true, true);
      t.uuid("identityId").notNullable().unique();
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");
    });
  }
  if (!(await knex.schema.hasTable(TableName.IdentityUaClientSecret))) {
    await knex.schema.createTable(TableName.IdentityUaClientSecret, (t) => {
      t.string("id", 36).primary().defaultTo(knex.fn.uuid());
      t.string("description").notNullable();
      t.string("clientSecretPrefix").notNullable();
      t.string("clientSecretHash").notNullable();
      t.datetime("clientSecretLastUsedAt");
      t.bigInteger("clientSecretNumUses").defaultTo(0).notNullable();
      t.bigInteger("clientSecretNumUsesLimit").defaultTo(0).notNullable();
      t.bigInteger("clientSecretTTL").defaultTo(0).notNullable();
      t.boolean("isClientSecretRevoked").defaultTo(false).notNullable();
      t.timestamps(true, true, true);
      t.uuid("identityUAId").notNullable();
      t.foreign("identityUAId").references("id").inTable(TableName.IdentityUniversalAuth).onDelete("CASCADE");
    });
  }
  await createOnUpdateTrigger(knex, TableName.IdentityUniversalAuth);
  await createOnUpdateTrigger(knex, TableName.IdentityUaClientSecret);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.IdentityUaClientSecret);
  await knex.schema.dropTableIfExists(TableName.IdentityUniversalAuth);
  await dropOnUpdateTrigger(knex, TableName.IdentityUaClientSecret);
  await dropOnUpdateTrigger(knex, TableName.IdentityUniversalAuth);
}
