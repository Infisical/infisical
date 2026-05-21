import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.Environment);
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn(TableName.Environment, "expiredAt");

  if (!hasColumn) {
    await knex.schema.alterTable(TableName.Environment, (t) => {
      t.timestamp("expiredAt", { useTz: true }).nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TableName.Environment);
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn(TableName.Environment, "expiredAt");

  if (hasColumn) {
    await knex.schema.alterTable(TableName.Environment, (t) => {
      t.dropColumn("expiredAt");
    });
  }
}
