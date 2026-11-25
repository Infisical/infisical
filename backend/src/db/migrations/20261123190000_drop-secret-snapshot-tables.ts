import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SnapshotSecretV2);
  await knex.schema.dropTableIfExists(TableName.SnapshotSecret);
  await knex.schema.dropTableIfExists(TableName.SnapshotFolder);
  await knex.schema.dropTableIfExists(TableName.Snapshot);
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Snapshot))) {
    await knex.schema.createTable(TableName.Snapshot, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("envId").notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      t.uuid("folderId").notNullable();
      t.uuid("parentFolderId");
      t.timestamps(true, true, true);

      t.index("envId", "idx_secret_snapshots_env_id");
      t.index("folderId", "idx_secret_snapshots_folder_id");
    });
    await createOnUpdateTrigger(knex, TableName.Snapshot);
  }

  if (!(await knex.schema.hasTable(TableName.SnapshotSecret))) {
    await knex.schema.createTable(TableName.SnapshotSecret, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("envId").index().notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      t.uuid("secretVersionId").index().notNullable();
      t.foreign("secretVersionId").references("id").inTable(TableName.SecretVersion).onDelete("CASCADE");
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
      t.uuid("folderVersionId").notNullable();
      t.foreign("folderVersionId").references("id").inTable(TableName.SecretFolderVersion).onDelete("CASCADE");
      t.uuid("snapshotId").index().notNullable();
      t.foreign("snapshotId").references("id").inTable(TableName.Snapshot).onDelete("CASCADE");
      t.timestamps(true, true, true);

      t.index("envId", "idx_secret_snapshot_folders_env_id");
      t.index("folderVersionId", "idx_secret_snapshot_folders_folder_version_id");
    });
  }

  if (!(await knex.schema.hasTable(TableName.SnapshotSecretV2))) {
    await knex.schema.createTable(TableName.SnapshotSecretV2, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("envId").index().notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      t.uuid("secretVersionId").index().notNullable();
      t.foreign("secretVersionId").references("id").inTable(TableName.SecretVersionV2).onDelete("CASCADE");
      t.uuid("snapshotId").index().notNullable();
      t.foreign("snapshotId").references("id").inTable(TableName.Snapshot).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });
  }
}
