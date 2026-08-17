import { Knex } from "knex";

import { TableName } from "../schemas";

const FOLDER_ID_INDEX = "additional_privileges_folder_id_index";
const FOLDER_REQUIRES_ROLE_CONSTRAINT = "additional_privileges_folder_requires_role";
const FOLDER_REQUIRES_PROJECT_CONSTRAINT = "additional_privileges_folder_requires_project";

export async function up(knex: Knex): Promise<void> {
  const hasFolderId = await knex.schema.hasColumn(TableName.AdditionalPrivilege, "folderId");
  const hasRole = await knex.schema.hasColumn(TableName.AdditionalPrivilege, "role");

  await knex.schema.alterTable(TableName.AdditionalPrivilege, (t) => {
    if (!hasFolderId) {
      t.uuid("folderId");
      t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("CASCADE");
      t.index("folderId", FOLDER_ID_INDEX, { predicate: knex.whereNotNull("folderId") });
    }

    if (!hasRole) {
      t.string("role");
    }

    t.setNullable("permissions");
  });

  await knex.raw(
    `ALTER TABLE "${TableName.AdditionalPrivilege}" ADD CONSTRAINT "${FOLDER_REQUIRES_ROLE_CONSTRAINT}" CHECK ("folderId" IS NULL OR "role" IS NOT NULL)`
  );
  // A folder always belongs to a project, so a folder-scoped grant is never org-scoped.
  await knex.raw(
    `ALTER TABLE "${TableName.AdditionalPrivilege}" ADD CONSTRAINT "${FOLDER_REQUIRES_PROJECT_CONSTRAINT}" CHECK ("folderId" IS NULL OR "projectId" IS NOT NULL)`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(
    `ALTER TABLE "${TableName.AdditionalPrivilege}" DROP CONSTRAINT IF EXISTS "${FOLDER_REQUIRES_PROJECT_CONSTRAINT}"`
  );
  await knex.raw(
    `ALTER TABLE "${TableName.AdditionalPrivilege}" DROP CONSTRAINT IF EXISTS "${FOLDER_REQUIRES_ROLE_CONSTRAINT}"`
  );
  await knex(TableName.AdditionalPrivilege).whereNull("permissions").del();

  const hasFolderId = await knex.schema.hasColumn(TableName.AdditionalPrivilege, "folderId");
  const hasRole = await knex.schema.hasColumn(TableName.AdditionalPrivilege, "role");

  await knex.schema.alterTable(TableName.AdditionalPrivilege, (t) => {
    if (hasFolderId) {
      t.dropColumn("folderId");
    }

    if (hasRole) {
      t.dropColumn("role");
    }

    t.dropNullable("permissions");
  });
}
