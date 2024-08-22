import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const doesFolderIdExist = await knex.schema.hasColumn(TableName.Secret, "folderId");
  const doesUserIdExist = await knex.schema.hasColumn(TableName.Secret, "userId");
  if (await knex.schema.hasTable(TableName.Secret)) {
    await knex.schema.alterTable(TableName.Secret, (t) => {
      if (doesFolderIdExist && doesUserIdExist) t.index(["folderId", "userId"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const doesFolderIdExist = await knex.schema.hasColumn(TableName.Secret, "folderId");
  const doesUserIdExist = await knex.schema.hasColumn(TableName.Secret, "userId");

  if (await knex.schema.hasTable(TableName.Secret)) {
    await knex.schema.alterTable(TableName.Secret, (t) => {
      if (doesUserIdExist && doesFolderIdExist) t.dropIndex(["folderId", "userId"]);
    });
  }
}
