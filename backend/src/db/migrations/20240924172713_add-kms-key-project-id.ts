import { Knex } from "knex";

import { dropConstraintIfExists } from "@app/db/migrations/utils/dropConstraintIfExists";
import { TableName } from "@app/db/schemas";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.KmsKey)) {
    const hasOrgId = await knex.schema.hasColumn(TableName.KmsKey, "orgId");
    const hasSlug = await knex.schema.hasColumn(TableName.KmsKey, "slug");

    // drop constraint if exists (won't exist if rolled back, see below)
    await dropConstraintIfExists(TableName.KmsKey, "kms_keys_orgid_slug_unique", knex);

    // projectId for CMEK functionality
    await knex.schema.alterTable(TableName.KmsKey, (table) => {
      table.string("projectId").nullable().references("id").inTable(TableName.Project).onDelete("CASCADE");

      if (hasOrgId) {
        table.unique(["orgId", "projectId", "slug"]);
      }

      if (hasSlug) {
        table.renameColumn("slug", "name");
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.KmsKey)) {
    const hasOrgId = await knex.schema.hasColumn(TableName.KmsKey, "orgId");
    const hasName = await knex.schema.hasColumn(TableName.KmsKey, "name");

    // remove projectId for CMEK functionality
    await knex.schema.alterTable(TableName.KmsKey, (table) => {
      if (hasName) {
        table.renameColumn("name", "slug");
      }

      if (hasOrgId) {
        table.dropUnique(["orgId", "projectId", "slug"]);
      }
      table.dropColumn("projectId");
    });
  }
}
