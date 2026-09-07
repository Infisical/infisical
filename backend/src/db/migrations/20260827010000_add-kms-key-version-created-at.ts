import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (
    (await knex.schema.hasTable(TableName.InternalKmsKeyVersion)) &&
    !(await knex.schema.hasColumn(TableName.InternalKmsKeyVersion, "createdAt"))
  ) {
    await knex.schema.alterTable(TableName.InternalKmsKeyVersion, (t) => {
      t.timestamp("createdAt", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (
    (await knex.schema.hasTable(TableName.InternalKmsKeyVersion)) &&
    (await knex.schema.hasColumn(TableName.InternalKmsKeyVersion, "createdAt"))
  ) {
    await knex.schema.alterTable(TableName.InternalKmsKeyVersion, (t) => {
      t.dropColumn("createdAt");
    });
  }
}
