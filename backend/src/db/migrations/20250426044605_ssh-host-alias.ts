import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasAliasColumn = await knex.schema.hasColumn(TableName.SshHost, "alias");
  if (!hasAliasColumn) {
    await knex.schema.alterTable(TableName.SshHost, (t) => {
      t.string("alias").nullable();
      t.unique(["projectId", "alias"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasAliasColumn = await knex.schema.hasColumn(TableName.SshHost, "alias");
  if (hasAliasColumn) {
    await knex.schema.alterTable(TableName.SshHost, (t) => {
      t.dropUnique(["projectId", "alias"]);
      t.dropColumn("alias");
    });
  }
}
