import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.IdentityLdapAuth)) {
    const hasLockoutEnabled = await knex.schema.hasColumn(TableName.IdentityLdapAuth, "lockoutEnabled");
    const hasLockoutThreshold = await knex.schema.hasColumn(TableName.IdentityLdapAuth, "lockoutThreshold");
    const hasLockoutDuration = await knex.schema.hasColumn(TableName.IdentityLdapAuth, "lockoutDuration");
    const hasLockoutCounterReset = await knex.schema.hasColumn(TableName.IdentityLdapAuth, "lockoutCounterReset");

    await knex.schema.alterTable(TableName.IdentityLdapAuth, (t) => {
      if (!hasLockoutEnabled) {
        t.boolean("lockoutEnabled").notNullable().defaultTo(true);
      }
      if (!hasLockoutThreshold) {
        t.integer("lockoutThreshold").notNullable().defaultTo(3);
      }
      if (!hasLockoutDuration) {
        t.integer("lockoutDuration").notNullable().defaultTo(300); // 5 minutes (in seconds)
      }
      if (!hasLockoutCounterReset) {
        t.integer("lockoutCounterReset").notNullable().defaultTo(30); // 30 seconds
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.IdentityLdapAuth)) {
    const hasLockoutEnabled = await knex.schema.hasColumn(TableName.IdentityLdapAuth, "lockoutEnabled");
    const hasLockoutThreshold = await knex.schema.hasColumn(TableName.IdentityLdapAuth, "lockoutThreshold");
    const hasLockoutDuration = await knex.schema.hasColumn(TableName.IdentityLdapAuth, "lockoutDuration");
    const hasLockoutCounterReset = await knex.schema.hasColumn(TableName.IdentityLdapAuth, "lockoutCounterReset");

    await knex.schema.alterTable(TableName.IdentityLdapAuth, (t) => {
      if (hasLockoutEnabled) {
        t.dropColumn("lockoutEnabled");
      }
      if (hasLockoutThreshold) {
        t.dropColumn("lockoutThreshold");
      }
      if (hasLockoutDuration) {
        t.dropColumn("lockoutDuration");
      }
      if (hasLockoutCounterReset) {
        t.dropColumn("lockoutCounterReset");
      }
    });
  }
}
