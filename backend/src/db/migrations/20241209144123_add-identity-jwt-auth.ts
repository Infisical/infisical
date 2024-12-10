import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.IdentityJwtAuth))) {
    await knex.schema.createTable(TableName.IdentityJwtAuth, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.bigInteger("accessTokenTTL").defaultTo(7200).notNullable();
      t.bigInteger("accessTokenMaxTTL").defaultTo(7200).notNullable();
      t.bigInteger("accessTokenNumUsesLimit").defaultTo(0).notNullable();
      t.jsonb("accessTokenTrustedIps").notNullable();
      t.uuid("identityId").notNullable().unique();
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");
      t.string("configurationType").notNullable();
      t.string("jwksUrl").notNullable();
      t.binary("encryptedJwksCaCert").notNullable();
      t.binary("encryptedPublicKeys").notNullable();
      t.string("boundIssuer").notNullable();
      t.string("boundAudiences").notNullable();
      t.jsonb("boundClaims").notNullable();
      t.string("boundSubject").notNullable();
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.IdentityJwtAuth);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.IdentityJwtAuth);
  await dropOnUpdateTrigger(knex, TableName.IdentityJwtAuth);
}
