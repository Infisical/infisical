import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

// The point-in-time secret snapshot feature has been removed. Drop its tables.
// The application code that read/wrote these tables is removed in a separate PR.
// Child tables (which hold FKs into secret_snapshots) must be dropped before the
// parent, otherwise Postgres rejects the DROP.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SnapshotSecret);
  await knex.schema.dropTableIfExists(TableName.SnapshotSecretV2);
  await knex.schema.dropTableIfExists(TableName.SnapshotFolder);

  if (await knex.schema.hasTable(TableName.Snapshot)) {
    await dropOnUpdateTrigger(knex, TableName.Snapshot);
  }
  await knex.schema.dropTableIfExists(TableName.Snapshot);
}

export async function down(knex: Knex): Promise<void> {
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
      t.index("folderId", "idx_secret_snapshots_folder_id");
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
      t.index("envId");
      t.index("secretVersionId");
      t.index("snapshotId");
    });
  }

  if (!(await knex.schema.hasTable(TableName.SnapshotSecretV2))) {
    await knex.schema.createTable(TableName.SnapshotSecretV2, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("envId").index().notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      // not a relation kept like that to keep it when rolled back
      t.uuid("secretVersionId").index().notNullable();
      t.foreign("secretVersionId").references("id").inTable(TableName.SecretVersionV2).onDelete("CASCADE");
      t.uuid("snapshotId").index().notNullable();
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
      t.index("snapshotId");
      t.index("folderVersionId", "idx_secret_snapshot_folders_folder_version_id");
    });
  }
}
