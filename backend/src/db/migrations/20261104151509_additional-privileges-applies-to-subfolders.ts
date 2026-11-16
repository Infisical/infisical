import { Knex } from "knex";

import { TableName } from "../schemas";

const APPLIES_TO_SUBFOLDERS_REQUIRES_FOLDER_CONSTRAINT = "additional_privileges_applies_to_subfolders_requires_folder";

export async function up(knex: Knex): Promise<void> {
  const hasAppliesToSubfolders = await knex.schema.hasColumn(TableName.AdditionalPrivilege, "appliesToSubfolders");
  if (!hasAppliesToSubfolders) {
    await knex.schema.alterTable(TableName.AdditionalPrivilege, (t) => {
      t.boolean("appliesToSubfolders");
    });
  }

  await knex.raw(
    `ALTER TABLE "${TableName.AdditionalPrivilege}" DROP CONSTRAINT IF EXISTS "${APPLIES_TO_SUBFOLDERS_REQUIRES_FOLDER_CONSTRAINT}"`
  );
  await knex.raw(
    `ALTER TABLE "${TableName.AdditionalPrivilege}" ADD CONSTRAINT "${APPLIES_TO_SUBFOLDERS_REQUIRES_FOLDER_CONSTRAINT}" CHECK ("appliesToSubfolders" IS NULL OR "folderId" IS NOT NULL)`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE "${TableName.AdditionalPrivilege}" DROP CONSTRAINT IF EXISTS "${APPLIES_TO_SUBFOLDERS_REQUIRES_FOLDER_CONSTRAINT}"`
  );

  const hasAppliesToSubfolders = await knex.schema.hasColumn(TableName.AdditionalPrivilege, "appliesToSubfolders");
  if (hasAppliesToSubfolders) {
    await knex.schema.alterTable(TableName.AdditionalPrivilege, (t) => {
      t.dropColumn("appliesToSubfolders");
    });
  }
}
