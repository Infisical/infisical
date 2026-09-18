import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasLastUsedAt = await knex.schema.hasColumn(TableName.ProxiedService, "lastUsedAt");
  if (!hasLastUsedAt) {
    await knex.schema.alterTable(TableName.ProxiedService, (t) => {
      t.datetime("lastUsedAt").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasLastUsedAt = await knex.schema.hasColumn(TableName.ProxiedService, "lastUsedAt");
  if (hasLastUsedAt) {
    await knex.schema.alterTable(TableName.ProxiedService, (t) => {
      t.dropColumn("lastUsedAt");
    });
  }
}
