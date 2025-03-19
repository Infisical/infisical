import { Knex } from "knex";

import { TableName } from "../schemas/models";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.SuperAdmin, "adminIdentityIds"))) {
    await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
      t.specificType("adminIdentityIds", "text[]");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SuperAdmin, "adminIdentityIds")) {
    await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
      t.dropColumn("adminIdentityIds");
    });
  }
}
