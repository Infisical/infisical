import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.RateLimit))) {
    await knex.schema.createTable(TableName.RateLimit, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.integer("readRateLimit").defaultTo(600).notNullable();
      t.integer("writeRateLimit").defaultTo(200).notNullable();
      t.integer("secretsRateLimit").defaultTo(60).notNullable();
      t.integer("authRateLimit").defaultTo(60).notNullable();
      t.integer("inviteUserRateLimit").defaultTo(30).notNullable();
      t.integer("mfaRateLimit").defaultTo(20).notNullable();
      t.integer("creationLimit").defaultTo(30).notNullable();
      t.integer("publicEndpointLimit").defaultTo(30).notNullable();
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.RateLimit);

    // create init rate limit entry with defaults
    await knex(TableName.RateLimit).insert({});
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.RateLimit);
  await dropOnUpdateTrigger(knex, TableName.RateLimit);
}
