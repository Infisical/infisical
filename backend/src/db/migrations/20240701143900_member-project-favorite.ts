import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.OrgMembership, "projectFavorites"))) {
    await knex.schema.alterTable(TableName.OrgMembership, (tb) => {
      tb.specificType("projectFavorites", "text[]");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.OrgMembership, "projectFavorites")) {
    await knex.schema.alterTable(TableName.OrgMembership, (t) => {
      t.dropColumn("projectFavorites");
    });
  }
}
