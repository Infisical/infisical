import { Knex } from "knex";

import { TableName } from "../schemas";

const TABLES = [TableName.IdentityAwsAuth, TableName.IdentityGcpAuth];

export async function up(knex: Knex): Promise<void> {
  for (const tableName of TABLES) {
    // eslint-disable-next-line no-await-in-loop
    const hasColumn = await knex.schema.hasColumn(tableName, "requireAllowList");
    if (!hasColumn) {
      // eslint-disable-next-line no-await-in-loop
      await knex.schema.alterTable(tableName, (t) => {
        t.boolean("requireAllowList").notNullable().defaultTo(false);
      });
      // Rows that exist now were saved before the allow list was enforced, so they get false. Flipping the
      // default afterwards means every row created from here on is enforced, with no backfill needed.
      // eslint-disable-next-line no-await-in-loop
      await knex.raw(`ALTER TABLE ?? ALTER COLUMN "requireAllowList" SET DEFAULT true`, [tableName]);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const tableName of TABLES) {
    // eslint-disable-next-line no-await-in-loop
    const hasColumn = await knex.schema.hasColumn(tableName, "requireAllowList");
    if (hasColumn) {
      // eslint-disable-next-line no-await-in-loop
      await knex.schema.alterTable(tableName, (t) => {
        t.dropColumn("requireAllowList");
      });
    }
  }
}
