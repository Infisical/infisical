import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  const hasFolderCommitTable = await knex.schema.hasTable(TableName.FolderCommit);
  if (!hasFolderCommitTable) {
    await knex.schema.createTable(TableName.FolderCommit, (t) => {
      t.uuid("id").primary().defaultTo(knex.fn.uuid());
      t.bigIncrements("commitId");
      t.jsonb("actorMetadata").notNullable();
      t.string("actorType").notNullable();
      t.string("message");
      t.uuid("folderId").notNullable();
      t.uuid("envId").notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      t.timestamps(true, true, true);

      t.index("folderId");
      t.index("envId");
    });
  }

  const hasFolderCommitChangesTable = await knex.schema.hasTable(TableName.FolderCommitChanges);
  if (!hasFolderCommitChangesTable) {
    await knex.schema.createTable(TableName.FolderCommitChanges, (t) => {
      t.uuid("id").primary().defaultTo(knex.fn.uuid());
      t.uuid("folderCommitId").notNullable();
      t.foreign("folderCommitId").references("id").inTable(TableName.FolderCommit).onDelete("CASCADE");
      t.string("changeType").notNullable();
      t.boolean("isUpdate").notNullable().defaultTo(false);
      t.uuid("secretVersionId");
      t.foreign("secretVersionId").references("id").inTable(TableName.SecretVersionV2).onDelete("CASCADE");
      t.uuid("folderVersionId");
      t.foreign("folderVersionId").references("id").inTable(TableName.SecretFolderVersion).onDelete("CASCADE");
      t.timestamps(true, true, true);

      t.index("folderCommitId");
      t.index("secretVersionId");
      t.index("folderVersionId");
    });
  }

  const hasFolderCheckpointTable = await knex.schema.hasTable(TableName.FolderCheckpoint);
  if (!hasFolderCheckpointTable) {
    await knex.schema.createTable(TableName.FolderCheckpoint, (t) => {
      t.uuid("id").primary().defaultTo(knex.fn.uuid());
      t.uuid("folderCommitId").notNullable();
      t.foreign("folderCommitId").references("id").inTable(TableName.FolderCommit).onDelete("CASCADE");
      t.timestamps(true, true, true);

      t.index("folderCommitId");
    });
  }

  const hasFolderCheckpointResourcesTable = await knex.schema.hasTable(TableName.FolderCheckpointResources);
  if (!hasFolderCheckpointResourcesTable) {
    await knex.schema.createTable(TableName.FolderCheckpointResources, (t) => {
      t.uuid("id").primary().defaultTo(knex.fn.uuid());
      t.uuid("folderCheckpointId").notNullable();
      t.foreign("folderCheckpointId").references("id").inTable(TableName.FolderCheckpoint).onDelete("CASCADE");
      t.uuid("secretVersionId");
      t.foreign("secretVersionId").references("id").inTable(TableName.SecretVersionV2).onDelete("CASCADE");
      t.uuid("folderVersionId");
      t.foreign("folderVersionId").references("id").inTable(TableName.SecretFolderVersion).onDelete("CASCADE");
      t.timestamps(true, true, true);

      t.index("folderCheckpointId");
      t.index("secretVersionId");
      t.index("folderVersionId");
    });
  }

  const hasFolderTreeCheckpointTable = await knex.schema.hasTable(TableName.FolderTreeCheckpoint);
  if (!hasFolderTreeCheckpointTable) {
    await knex.schema.createTable(TableName.FolderTreeCheckpoint, (t) => {
      t.uuid("id").primary().defaultTo(knex.fn.uuid());
      t.uuid("folderCommitId").notNullable();
      t.foreign("folderCommitId").references("id").inTable(TableName.FolderCommit).onDelete("CASCADE");
      t.timestamps(true, true, true);

      t.index("folderCommitId");
    });
  }

  const hasFolderTreeCheckpointResourcesTable = await knex.schema.hasTable(TableName.FolderTreeCheckpointResources);
  if (!hasFolderTreeCheckpointResourcesTable) {
    await knex.schema.createTable(TableName.FolderTreeCheckpointResources, (t) => {
      t.uuid("id").primary().defaultTo(knex.fn.uuid());
      t.uuid("folderTreeCheckpointId").notNullable();
      t.foreign("folderTreeCheckpointId").references("id").inTable(TableName.FolderTreeCheckpoint).onDelete("CASCADE");
      t.uuid("folderId").notNullable();
      t.uuid("folderCommitId").notNullable();
      t.foreign("folderCommitId").references("id").inTable(TableName.FolderCommit).onDelete("CASCADE");
      t.timestamps(true, true, true);

      t.index("folderTreeCheckpointId");
      t.index("folderId");
      t.index("folderCommitId");
    });
  }

  if (!hasFolderCommitTable) {
    await createOnUpdateTrigger(knex, TableName.FolderCommit);
  }

  if (!hasFolderCommitChangesTable) {
    await createOnUpdateTrigger(knex, TableName.FolderCommitChanges);
  }

  if (!hasFolderCheckpointTable) {
    await createOnUpdateTrigger(knex, TableName.FolderCheckpoint);
  }

  if (!hasFolderCheckpointResourcesTable) {
    await createOnUpdateTrigger(knex, TableName.FolderCheckpointResources);
  }

  if (!hasFolderTreeCheckpointTable) {
    await createOnUpdateTrigger(knex, TableName.FolderTreeCheckpoint);
  }

  if (!hasFolderTreeCheckpointResourcesTable) {
    await createOnUpdateTrigger(knex, TableName.FolderTreeCheckpointResources);
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasFolderCheckpointResourcesTable = await knex.schema.hasTable(TableName.FolderCheckpointResources);
  const hasFolderTreeCheckpointResourcesTable = await knex.schema.hasTable(TableName.FolderTreeCheckpointResources);
  const hasFolderCommitTable = await knex.schema.hasTable(TableName.FolderCommit);
  const hasFolderCommitChangesTable = await knex.schema.hasTable(TableName.FolderCommitChanges);
  const hasFolderTreeCheckpointTable = await knex.schema.hasTable(TableName.FolderTreeCheckpoint);
  const hasFolderCheckpointTable = await knex.schema.hasTable(TableName.FolderCheckpoint);

  if (hasFolderTreeCheckpointResourcesTable) {
    await dropOnUpdateTrigger(knex, TableName.FolderTreeCheckpointResources);
    await knex.schema.dropTableIfExists(TableName.FolderTreeCheckpointResources);
  }

  if (hasFolderCheckpointResourcesTable) {
    await dropOnUpdateTrigger(knex, TableName.FolderCheckpointResources);
    await knex.schema.dropTableIfExists(TableName.FolderCheckpointResources);
  }

  if (hasFolderTreeCheckpointTable) {
    await dropOnUpdateTrigger(knex, TableName.FolderTreeCheckpoint);
    await knex.schema.dropTableIfExists(TableName.FolderTreeCheckpoint);
  }

  if (hasFolderCheckpointTable) {
    await dropOnUpdateTrigger(knex, TableName.FolderCheckpoint);
    await knex.schema.dropTableIfExists(TableName.FolderCheckpoint);
  }

  if (hasFolderCommitChangesTable) {
    await dropOnUpdateTrigger(knex, TableName.FolderCommitChanges);
    await knex.schema.dropTableIfExists(TableName.FolderCommitChanges);
  }

  if (hasFolderCommitTable) {
    await dropOnUpdateTrigger(knex, TableName.FolderCommit);
    await knex.schema.dropTableIfExists(TableName.FolderCommit);
  }
}
