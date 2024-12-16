import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SecretVersionV2, "folderId")) {
    await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
      t.index("folderId");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SecretVersionV2, "folderId")) {
    await knex.schema.alterTable(TableName.SecretVersionV2, (t) => {
      t.dropIndex("folderId");
    });
  }
}
