import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(TableName.IdentityTokenAuth, (t) => {
    t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
    t.bigInteger("accessTokenTTL").defaultTo(7200).notNullable();
    t.bigInteger("accessTokenMaxTTL").defaultTo(7200).notNullable();
    t.bigInteger("accessTokenNumUsesLimit").defaultTo(0).notNullable();
    t.jsonb("accessTokenTrustedIps").notNullable();
    t.timestamps(true, true, true);
    t.uuid("identityId").notNullable().unique();
    t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");
  });

  await createOnUpdateTrigger(knex, TableName.IdentityTokenAuth);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.IdentityTokenAuth);
  await dropOnUpdateTrigger(knex, TableName.IdentityTokenAuth);
}
