import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasProjectDescription = await knex.schema.hasColumn(TableName.Project, "description");

  await knex.schema.alterTable(TableName.Project, (t) => {
    if (!hasProjectDescription) t.string("description");
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasProjectDescription = await knex.schema.hasColumn(TableName.Project, "description");

  await knex.schema.alterTable(TableName.Project, (t) => {
    if (hasProjectDescription) t.dropColumn("description");
  });
}
