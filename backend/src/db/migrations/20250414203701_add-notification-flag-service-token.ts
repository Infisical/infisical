import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TableName.ServiceToken, "notificationSent");
  if (!hasCol) {
    await knex.schema.alterTable(TableName.ServiceToken, (t) => {
      t.boolean("notificationSent").defaultTo(false);
    });

    // Update only tokens where expiresAt is before current time
    await knex(TableName.ServiceToken)
      .whereRaw(`${TableName.ServiceToken}."expiresAt" < NOW()`)
      .whereNotNull("expiresAt")
      .update({ notificationSent: true });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TableName.ServiceToken, "notificationSent");
  if (hasCol) {
    await knex.schema.alterTable(TableName.ServiceToken, (t) => {
      t.dropColumn("notificationSent");
    });
  }
}
