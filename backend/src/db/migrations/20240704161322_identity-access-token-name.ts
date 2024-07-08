import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.IdentityAccessToken)) {
    const hasNameColumn = await knex.schema.hasColumn(TableName.IdentityAccessToken, "name");
    if (!hasNameColumn) {
      await knex.schema.alterTable(TableName.IdentityAccessToken, (t) => {
        t.string("name").nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.IdentityAccessToken)) {
    if (await knex.schema.hasColumn(TableName.IdentityAccessToken, "name")) {
      await knex.schema.alterTable(TableName.IdentityAccessToken, (t) => {
        t.dropColumn("name");
      });
    }
  }
}
