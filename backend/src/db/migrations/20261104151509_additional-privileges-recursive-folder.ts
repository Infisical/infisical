import { Knex } from "knex";

import { TableName } from "../schemas";

const RECURSIVE_REQUIRES_FOLDER_CONSTRAINT = "additional_privileges_recursive_requires_folder";

export async function up(knex: Knex): Promise<void> {
  const hasIsRecursiveFolder = await knex.schema.hasColumn(TableName.AdditionalPrivilege, "isRecursiveFolder");
  if (!hasIsRecursiveFolder) {
    await knex.schema.alterTable(TableName.AdditionalPrivilege, (t) => {
      t.boolean("isRecursiveFolder");
    });
  }

  await knex.raw(
    `ALTER TABLE "${TableName.AdditionalPrivilege}" DROP CONSTRAINT IF EXISTS "${RECURSIVE_REQUIRES_FOLDER_CONSTRAINT}"`
  );
  await knex.raw(
    `ALTER TABLE "${TableName.AdditionalPrivilege}" ADD CONSTRAINT "${RECURSIVE_REQUIRES_FOLDER_CONSTRAINT}" CHECK ("isRecursiveFolder" IS NULL OR "folderId" IS NOT NULL)`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE "${TableName.AdditionalPrivilege}" DROP CONSTRAINT IF EXISTS "${RECURSIVE_REQUIRES_FOLDER_CONSTRAINT}"`
  );

  const hasIsRecursiveFolder = await knex.schema.hasColumn(TableName.AdditionalPrivilege, "isRecursiveFolder");
  if (hasIsRecursiveFolder) {
    await knex.schema.alterTable(TableName.AdditionalPrivilege, (t) => {
      t.dropColumn("isRecursiveFolder");
    });
  }
}
