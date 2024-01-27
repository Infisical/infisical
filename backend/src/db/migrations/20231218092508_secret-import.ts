import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretImport))) {
    await knex.schema.createTable(TableName.SecretImport, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.integer("version").defaultTo(1);
      t.string("importPath").notNullable();
      t.uuid("importEnv").notNullable();
      t.foreign("importEnv").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      t.integer("position").notNullable();
      t.timestamps(true, true, true);
      t.uuid("folderId").notNullable();
      t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("CASCADE");
      t.unique(["folderId", "position"], {
        indexName: "import_pos_composite_uniqe",
        deferrable: "deferred"
      });
    });
  }
  await createOnUpdateTrigger(knex, TableName.SecretImport);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SecretImport);
  await dropOnUpdateTrigger(knex, TableName.SecretImport);
}
