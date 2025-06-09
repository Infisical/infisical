import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.SecretFolderVersion, "description"))) {
    await knex.schema.alterTable(TableName.SecretFolderVersion, (t) => {
      t.string("description").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SecretFolderVersion, "description")) {
    await knex.schema.alterTable(TableName.SecretFolderVersion, (t) => {
      t.dropColumn("description");
    });
  }
}
