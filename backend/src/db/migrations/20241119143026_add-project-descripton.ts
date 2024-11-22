import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasProjectDescription = await knex.schema.hasColumn(TableName.Project, "description");

  if (!hasProjectDescription) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.string("description");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasProjectDescription = await knex.schema.hasColumn(TableName.Project, "description");

  if (hasProjectDescription) {
    await knex.schema.alterTable(TableName.Project, (t) => {
      t.dropColumn("description");
    });
  }
}
