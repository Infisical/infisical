import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasProjectIdCol = await knex.schema.hasColumn(TableName.Identity, "projectId");
  if (!hasProjectIdCol) {
    await knex.schema.alterTable(TableName.Identity, (t) => {
      t.string("projectId");
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasProjectIdCol = await knex.schema.hasColumn(TableName.Identity, "projectId");
  if (hasProjectIdCol) {
    await knex.schema.alterTable(TableName.Identity, (t) => {
      t.dropColumn("projectId");
    });
  }
}
