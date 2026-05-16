import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TableName.Project, "description");
  if (hasColumn) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.string("description", 1024).alter();
    });
  }
}

export async function down(): Promise<void> {
  // No down migration or it will error
}
