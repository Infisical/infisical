import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.IdentityLdapAuth)) {
    const hasLockoutEnabled = await knex.schema.hasColumn(TableName.IdentityLdapAuth, "lockoutEnabled");
    const hasLockoutThreshold = await knex.schema.hasColumn(TableName.IdentityLdapAuth, "lockoutThreshold");
    const hasLockoutDuration = await knex.schema.hasColumn(TableName.IdentityLdapAuth, "lockoutDurationSeconds");
    const hasLockoutCounterReset = await knex.schema.hasColumn(
      TableName.IdentityLdapAuth,
      "lockoutCounterResetSeconds"
    );

    await knex.schema.alterTable(TableName.IdentityLdapAuth, (t) => {
      if (!hasLockoutEnabled) {
        t.boolean("lockoutEnabled").notNullable().defaultTo(true);
      }
      if (!hasLockoutThreshold) {
        t.integer("lockoutThreshold").notNullable().defaultTo(3);
      }
      if (!hasLockoutDuration) {
        t.integer("lockoutDurationSeconds").notNullable().defaultTo(300); // 5 minutes
      }
      if (!hasLockoutCounterReset) {
        t.integer("lockoutCounterResetSeconds").notNullable().defaultTo(30); // 30 seconds
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.IdentityLdapAuth)) {
    const hasLockoutEnabled = await knex.schema.hasColumn(TableName.IdentityLdapAuth, "lockoutEnabled");
    const hasLockoutThreshold = await knex.schema.hasColumn(TableName.IdentityLdapAuth, "lockoutThreshold");
    const hasLockoutDuration = await knex.schema.hasColumn(TableName.IdentityLdapAuth, "lockoutDurationSeconds");
    const hasLockoutCounterReset = await knex.schema.hasColumn(
      TableName.IdentityLdapAuth,
      "lockoutCounterResetSeconds"
    );

    await knex.schema.alterTable(TableName.IdentityLdapAuth, (t) => {
      if (hasLockoutEnabled) {
        t.dropColumn("lockoutEnabled");
      }
      if (hasLockoutThreshold) {
        t.dropColumn("lockoutThreshold");
      }
      if (hasLockoutDuration) {
        t.dropColumn("lockoutDurationSeconds");
      }
      if (hasLockoutCounterReset) {
        t.dropColumn("lockoutCounterResetSeconds");
      }
    });
  }
}
