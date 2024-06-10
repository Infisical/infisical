import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasConsecutiveFailedPasswordAttempts = await knex.schema.hasColumn(
    TableName.Users,
    "consecutiveFailedPasswordAttempts"
  );

  await knex.schema.alterTable(TableName.Users, (tb) => {
    if (!hasConsecutiveFailedPasswordAttempts) {
      tb.integer("consecutiveFailedPasswordAttempts").defaultTo(0);
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasConsecutiveFailedPasswordAttempts = await knex.schema.hasColumn(
    TableName.Users,
    "consecutiveFailedPasswordAttempts"
  );

  await knex.schema.alterTable(TableName.Users, (tb) => {
    if (hasConsecutiveFailedPasswordAttempts) {
      tb.dropColumn("consecutiveFailedPasswordAttempts");
    }
  });
}
