import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretImportVersion))) {
    await knex.schema.createTable(TableName.SecretImportVersion, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.integer("version");
      t.string("importPath").notNullable();
      t.integer("position").notNullable();
      t.boolean("isReplication");
      t.boolean("isReserved");
      t.uuid("importEnv").notNullable();

      t.uuid("importId").notNullable();

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.SecretImportVersion);

    await knex.schema.alterTable(TableName.FolderCommitChanges, (t) => {
      t.uuid("importVersionId");
      t.foreign("importVersionId").references("id").inTable(TableName.SecretImportVersion).onDelete("CASCADE");

      t.uuid("reservedFolderCommitId");
      t.foreign("reservedFolderCommitId").references("id").inTable(TableName.FolderCommit).onDelete("CASCADE");

      t.index("importVersionId");
      t.index("reservedFolderCommitId");
    });

    await knex.schema.alterTable(TableName.FolderCheckpointResources, (t) => {
      t.uuid("importVersionId");
      t.foreign("importVersionId").references("id").inTable(TableName.SecretImportVersion).onDelete("CASCADE");

      t.uuid("reservedFolderCommitId");
      t.foreign("reservedFolderCommitId").references("id").inTable(TableName.FolderCommit).onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.SecretImportVersion)) {
    await knex.schema.alterTable(TableName.FolderCommitChanges, (t) => {
      t.dropColumn("importVersionId");
      t.dropColumn("reservedFolderCommitId");
    });

    await knex.schema.alterTable(TableName.FolderCheckpointResources, (t) => {
      t.dropColumn("importVersionId");
      t.dropColumn("reservedFolderCommitId");
    });

    await knex.schema.dropTable(TableName.SecretImportVersion);
    await dropOnUpdateTrigger(knex, TableName.SecretImportVersion);
  }
}
