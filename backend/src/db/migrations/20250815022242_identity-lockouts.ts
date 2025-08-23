import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.IdentityUniversalAuth)) {
    await knex.schema.alterTable(TableName.IdentityUniversalAuth, (t) => {
      t.boolean("lockoutEnabled").notNullable().defaultTo(true);
      t.integer("lockoutThreshold").notNullable().defaultTo(3);
      t.integer("lockoutDuration").notNullable().defaultTo(300); // 5 minutes (in seconds)
      t.integer("lockoutCounterReset").notNullable().defaultTo(30); // 30 seconds
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.IdentityUniversalAuth)) {
    await knex.schema.alterTable(TableName.IdentityUniversalAuth, (t) => {
      t.dropColumn("lockoutEnabled");
      t.dropColumn("lockoutThreshold");
      t.dropColumn("lockoutDuration");
      t.dropColumn("lockoutCounterReset");
    });
  }
}
