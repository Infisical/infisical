import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const doesParentColumExist = await knex.schema.hasColumn(TableName.SecretFolder, "parentId");
  const doesNameColumnExist = await knex.schema.hasColumn(TableName.SecretFolder, "name");
  if (doesParentColumExist && doesNameColumnExist) {
    await knex.schema.alterTable(TableName.SecretFolder, (t) => {
      t.index(["parentId", "name"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const doesParentColumExist = await knex.schema.hasColumn(TableName.SecretFolder, "parentId");
  const doesNameColumnExist = await knex.schema.hasColumn(TableName.SecretFolder, "name");
  if (doesParentColumExist && doesNameColumnExist) {
    await knex.schema.alterTable(TableName.SecretFolder, (t) => {
      t.dropIndex(["parentId", "name"]);
    });
  }
}
