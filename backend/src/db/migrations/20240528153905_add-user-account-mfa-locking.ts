import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasConsecutiveFailedMfaAttempts = await knex.schema.hasColumn(TableName.Users, "consecutiveFailedMfaAttempts");
  const hasIsLocked = await knex.schema.hasColumn(TableName.Users, "isLocked");
  const hasTemporaryLockDateEnd = await knex.schema.hasColumn(TableName.Users, "temporaryLockDateEnd");

  await knex.schema.alterTable(TableName.Users, (t) => {
    if (!hasConsecutiveFailedMfaAttempts) {
      t.integer("consecutiveFailedMfaAttempts").defaultTo(0);
    }

    if (!hasIsLocked) {
      t.boolean("isLocked").defaultTo(false);
    }

    if (!hasTemporaryLockDateEnd) {
      t.dateTime("temporaryLockDateEnd").nullable();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasConsecutiveFailedMfaAttempts = await knex.schema.hasColumn(TableName.Users, "consecutiveFailedMfaAttempts");
  const hasIsLocked = await knex.schema.hasColumn(TableName.Users, "isLocked");
  const hasTemporaryLockDateEnd = await knex.schema.hasColumn(TableName.Users, "temporaryLockDateEnd");

  await knex.schema.alterTable(TableName.Users, (t) => {
    if (hasConsecutiveFailedMfaAttempts) {
      t.dropColumn("consecutiveFailedMfaAttempts");
    }

    if (hasIsLocked) {
      t.dropColumn("isLocked");
    }

    if (hasTemporaryLockDateEnd) {
      t.dropColumn("temporaryLockDateEnd");
    }
  });
}
