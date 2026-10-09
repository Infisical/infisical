import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.DeprecatedRateLimit);
  if (hasTable) {
    await dropOnUpdateTrigger(knex, TableName.DeprecatedRateLimit);
    await knex.schema.dropTable(TableName.DeprecatedRateLimit);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.DeprecatedRateLimit);
  if (!hasTable) {
    await knex.schema.createTable(TableName.DeprecatedRateLimit, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.integer("readRateLimit").defaultTo(600).notNullable();
      t.integer("writeRateLimit").defaultTo(200).notNullable();
      t.integer("secretsRateLimit").defaultTo(60).notNullable();
      t.integer("authRateLimit").defaultTo(60).notNullable();
      t.integer("inviteUserRateLimit").defaultTo(30).notNullable();
      t.integer("mfaRateLimit").defaultTo(20).notNullable();
      t.integer("publicEndpointLimit").defaultTo(30).notNullable();
      t.integer("identityCreationLimit").defaultTo(30).notNullable();
      t.integer("projectCreationLimit").defaultTo(30).notNullable();
      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.DeprecatedRateLimit);
  }
}
