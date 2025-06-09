import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasSecretSharingColumn = await knex.schema.hasColumn(TableName.Project, "secretSharing");
  if (!hasSecretSharingColumn) {
    await knex.schema.table(TableName.Project, (table) => {
      table.boolean("secretSharing").notNullable().defaultTo(true);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasSecretSharingColumn = await knex.schema.hasColumn(TableName.Project, "secretSharing");
  if (hasSecretSharingColumn) {
    await knex.schema.table(TableName.Project, (table) => {
      table.dropColumn("secretSharing");
    });
  }
}
