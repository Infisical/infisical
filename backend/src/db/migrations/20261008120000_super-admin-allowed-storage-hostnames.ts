import { Knex } from "knex";

import { TableName } from "../schemas/models";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.SuperAdmin, "allowedStorageHostnames"))) {
    await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
      t.specificType("allowedStorageHostnames", "text[]");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SuperAdmin, "allowedStorageHostnames")) {
    await knex.schema.alterTable(TableName.SuperAdmin, (t) => {
      t.dropColumn("allowedStorageHostnames");
    });
  }
}
