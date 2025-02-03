import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const hasKmipClientTable = await knex.schema.hasTable(TableName.KmipClient);
  if (!hasKmipClientTable) {
    await knex.schema.createTable(TableName.KmipClient, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.specificType("permissions", "text[]");
      t.string("description");
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasKmipClientTable = await knex.schema.hasTable(TableName.KmipClient);
  if (hasKmipClientTable) {
    await knex.schema.dropTable(TableName.KmipClient);
  }
}
