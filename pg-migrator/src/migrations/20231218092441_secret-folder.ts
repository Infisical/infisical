import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretFolder))) {
    await knex.schema.createTable(TableName.SecretFolder, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.integer("version").defaultTo(1);
      t.timestamps(true, true, true);
      t.uuid("envId").notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      t.uuid("parentId");
      t.foreign("parentId").references("id").inTable(TableName.SecretFolder).onDelete("CASCADE");
    });
  }
  await createOnUpdateTrigger(knex, TableName.SecretFolder);

  if (!(await knex.schema.hasTable(TableName.SecretFolderVersion))) {
    await knex.schema.createTable(TableName.SecretFolderVersion, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.integer("version").defaultTo(1);
      t.timestamps(true, true, true);
      t.uuid("envId").notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      t.uuid("folderId").notNullable();
      // t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("SET NULL");
    });
  }

  await createOnUpdateTrigger(knex, TableName.SecretFolderVersion);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SecretFolderVersion);
  await knex.schema.dropTableIfExists(TableName.SecretFolder);
  await dropOnUpdateTrigger(knex, TableName.SecretFolder);
  await dropOnUpdateTrigger(knex, TableName.SecretFolderVersion);
}
