import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.Certificate)) {
    await knex.schema.alterTable(TableName.Certificate, (t) => {
      t.uuid("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Certificate).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // .. tbd
}
