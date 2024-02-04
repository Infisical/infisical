import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Snapshot))) {
    await knex.schema.createTable(TableName.Snapshot, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("envId").notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      // this is not a relation kept like that
      // this ensure snapshot are not lost when folder gets deleted and rolled back
      t.uuid("folderId").notNullable();
      t.uuid("parentFolderId");
      t.timestamps(true, true, true);
    });
  }
  await createOnUpdateTrigger(knex, TableName.Snapshot);

  if (!(await knex.schema.hasTable(TableName.SnapshotSecret))) {
    await knex.schema.createTable(TableName.SnapshotSecret, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("envId").notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      // not a relation kept like that to keep it when rolled back
      t.uuid("secretVersionId").notNullable();
      t.foreign("secretVersionId").references("id").inTable(TableName.SecretVersion).onDelete("CASCADE");
      t.uuid("snapshotId").notNullable();
      t.foreign("snapshotId").references("id").inTable(TableName.Snapshot).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }

  if (!(await knex.schema.hasTable(TableName.SnapshotFolder))) {
    await knex.schema.createTable(TableName.SnapshotFolder, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("envId").notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      // not a relation kept like that to keep it when rolled back
      t.uuid("folderVersionId").notNullable();
      t.foreign("folderVersionId").references("id").inTable(TableName.SecretFolderVersion).onDelete("CASCADE");
      t.uuid("snapshotId").notNullable();
      t.foreign("snapshotId").references("id").inTable(TableName.Snapshot).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SnapshotSecret);
  await knex.schema.dropTableIfExists(TableName.SnapshotFolder);
  await knex.schema.dropTableIfExists(TableName.Snapshot);
  await dropOnUpdateTrigger(knex, TableName.Snapshot);
}
