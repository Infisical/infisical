import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.IdentityAccessToken))) {
    await knex.schema.createTable(TableName.IdentityAccessToken, (t) => {
      t.string("id", 36).primary().defaultTo(knex.fn.uuid());
      t.bigInteger("accessTokenTTL").defaultTo(2592000).notNullable(); // 30 days second
      t.bigInteger("accessTokenMaxTTL").defaultTo(2592000).notNullable();
      t.bigInteger("accessTokenNumUses").defaultTo(0).notNullable();
      t.bigInteger("accessTokenNumUsesLimit").defaultTo(0).notNullable();
      t.datetime("accessTokenLastUsedAt");
      t.datetime("accessTokenLastRenewedAt");
      t.boolean("isAccessTokenRevoked").defaultTo(false).notNullable();
      t.string("identityUAClientSecretId");
      t.foreign("identityUAClientSecretId")
        .references("id")
        .inTable(TableName.IdentityUaClientSecret)
        .onDelete("CASCADE");
      t.uuid("identityId").notNullable();
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }

  await createOnUpdateTrigger(knex, TableName.IdentityAccessToken);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.IdentityAccessToken);
  await dropOnUpdateTrigger(knex, TableName.IdentityAccessToken);
}
