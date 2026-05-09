import { Knex } from "knex";

import { TableName } from "../schemas";

const COLUMN = "lastSeenAnnouncementId";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.Users, COLUMN);
  if (!hasColumn) {
    await knex.schema.alterTable(TableName.Users, (t) => {
      t.string(COLUMN).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.Users, COLUMN);
  if (hasColumn) {
    await knex.schema.alterTable(TableName.Users, (t) => {
      t.dropColumn(COLUMN);
    });
  }
}
