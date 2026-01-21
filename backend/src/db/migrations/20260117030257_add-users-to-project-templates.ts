import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TableName.ProjectTemplates, "users");
  if (!hasCol) {
    await knex.schema.alterTable(TableName.ProjectTemplates, (t) => {
      t.jsonb("users").nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasCol = await knex.schema.hasColumn(TableName.ProjectTemplates, "users");
  if (hasCol) {
    await knex.schema.alterTable(TableName.ProjectTemplates, (t) => {
      t.dropColumn("users");
    });
  }
}
