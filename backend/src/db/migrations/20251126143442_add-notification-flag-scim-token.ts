import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TableName.ScimToken, "expiryNotificationSent");
  if (!hasCol) {
    await knex.schema.alterTable(TableName.ScimToken, (t) => {
      t.boolean("expiryNotificationSent").defaultTo(false);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TableName.ScimToken, "expiryNotificationSent");
  if (hasCol) {
    await knex.schema.alterTable(TableName.ScimToken, (t) => {
      t.dropColumn("expiryNotificationSent");
    });
  }
}
