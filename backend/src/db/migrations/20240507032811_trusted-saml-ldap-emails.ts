import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const isUsersTablePresent = await knex.schema.hasTable(TableName.Users);
  if (isUsersTablePresent) {
    const hasIsEmailVerifiedColumn = await knex.schema.hasColumn(TableName.Users, "isEmailVerified");

    if (!hasIsEmailVerifiedColumn) {
      await knex.schema.alterTable(TableName.Users, (t) => {
        t.boolean("isEmailVerified").defaultTo(false);
      });
    }

    // Backfilling the isEmailVerified to true where isAccepted is true
    await knex(TableName.Users).update({ isEmailVerified: true }).where("isAccepted", true);
  }

  const isUserAliasTablePresent = await knex.schema.hasTable(TableName.UserAliases);
  if (isUserAliasTablePresent) {
    await knex.schema.alterTable(TableName.UserAliases, (t) => {
      t.string("username").nullable().alter();
    });
  }

  const isSuperAdminTablePresent = await knex.schema.hasTable(TableName.SuperAdmin);
  if (isSuperAdminTablePresent) {
    await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
      t.boolean("trustSamlEmails").defaultTo(false);
      t.boolean("trustLdapEmails").defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Users, "isEmailVerified")) {
    await knex.schema.alterTable(TableName.Users, (t) => {
      t.dropColumn("isEmailVerified");
    });
  }

  if (await knex.schema.hasColumn(TableName.SuperAdmin, "trustSamlEmails")) {
    await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
      t.dropColumn("trustSamlEmails");
    });
  }

  if (await knex.schema.hasColumn(TableName.SuperAdmin, "trustLdapEmails")) {
    await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
      t.dropColumn("trustLdapEmails");
    });
  }
}
