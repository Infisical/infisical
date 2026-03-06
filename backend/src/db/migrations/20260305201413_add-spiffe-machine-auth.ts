import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.IdentitySpiffeAuth))) {
    await knex.schema.createTable(TableName.IdentitySpiffeAuth, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("identityId").notNullable().unique();
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");
      t.string("trustDomain").notNullable();
      t.string("allowedSpiffeIds").notNullable();
      t.string("allowedAudiences").notNullable();
      t.string("configurationType").notNullable();
      t.binary("encryptedCaBundleJwks").nullable();
      t.string("bundleEndpointUrl").nullable();
      t.string("bundleEndpointProfile").nullable();
      t.binary("encryptedBundleEndpointCaCert").nullable();
      t.binary("encryptedCachedBundleJwks").nullable();
      t.datetime("cachedBundleLastRefreshedAt").nullable();
      t.integer("bundleRefreshHintSeconds").defaultTo(300).notNullable();
      t.bigInteger("accessTokenTTL").defaultTo(7200).notNullable();
      t.bigInteger("accessTokenMaxTTL").defaultTo(7200).notNullable();
      t.bigInteger("accessTokenNumUsesLimit").defaultTo(0).notNullable();
      t.jsonb("accessTokenTrustedIps").notNullable();
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.IdentitySpiffeAuth);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.IdentitySpiffeAuth);
  await dropOnUpdateTrigger(knex, TableName.IdentitySpiffeAuth);
}
