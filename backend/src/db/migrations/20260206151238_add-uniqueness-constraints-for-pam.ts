import { Knex } from "knex";

import { dropConstraintIfExists } from "@app/db/migrations/utils/dropConstraintIfExists";
import { TableName } from "@app/db/schemas";

const RESOURCE_CONSTRAINT_NAME = "pam_resources_name_project_id_unique";
const ACCOUNT_CONSTRAINT_NAME = "pam_accounts_name_resource_id_unique";

export async function up(knex: Knex): Promise<void> {
  // Delete all existing PAM access approval policies because we're moving away from FOLDERS
  if (await knex.schema.hasTable(TableName.ApprovalPolicies)) {
    await knex(TableName.ApprovalPolicies).where("type", "pam-access").del();
  }

  // 1. Add unique constraint for resource names within a project
  if (await knex.schema.hasTable(TableName.PamResource)) {
    const hasName = await knex.schema.hasColumn(TableName.PamResource, "name");
    const hasProjectId = await knex.schema.hasColumn(TableName.PamResource, "projectId");

    if (hasName && hasProjectId) {
      // Rename any duplicate resources (keep oldest, append random suffix to newer ones)
      await knex.raw(`
        UPDATE ${TableName.PamResource} r1
        SET "name" = r1."name" || '-' || substr(md5(random()::text), 1, 4)
        WHERE EXISTS (
          SELECT 1 FROM ${TableName.PamResource} r2
          WHERE r2."projectId" = r1."projectId"
            AND r2."name" = r1."name"
            AND r2."createdAt" < r1."createdAt"
        )
      `);

      await dropConstraintIfExists(TableName.PamResource, RESOURCE_CONSTRAINT_NAME, knex);
      await knex.schema.alterTable(TableName.PamResource, (table) => {
        table.unique(["name", "projectId"], { indexName: RESOURCE_CONSTRAINT_NAME });
      });
    }
  }

  // 2. Add unique constraint for account names within the same resource
  if (await knex.schema.hasTable(TableName.PamAccount)) {
    const hasName = await knex.schema.hasColumn(TableName.PamAccount, "name");
    const hasResourceId = await knex.schema.hasColumn(TableName.PamAccount, "resourceId");

    if (hasName && hasResourceId) {
      // Drop the old project/folder-level unique indexes from the original PAM migration,
      // since accounts should only be unique within a resource, not across the entire project.
      await knex.raw("DROP INDEX IF EXISTS ??", ["uidx_pam_account_children_name"]);
      await knex.raw("DROP INDEX IF EXISTS ??", ["uidx_pam_account_root_name"]);

      // Rename any duplicate accounts (keep oldest, append random suffix to newer ones)
      await knex.raw(`
        UPDATE ${TableName.PamAccount} a1
        SET "name" = a1."name" || '-' || substr(md5(random()::text), 1, 4)
        WHERE EXISTS (
          SELECT 1 FROM ${TableName.PamAccount} a2
          WHERE a2."resourceId" = a1."resourceId"
            AND a2."name" = a1."name"
            AND a2."createdAt" < a1."createdAt"
        )
      `);

      await dropConstraintIfExists(TableName.PamAccount, ACCOUNT_CONSTRAINT_NAME, knex);
      await knex.schema.alterTable(TableName.PamAccount, (table) => {
        table.unique(["name", "resourceId"], { indexName: ACCOUNT_CONSTRAINT_NAME });
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.PamResource)) {
    await dropConstraintIfExists(TableName.PamResource, RESOURCE_CONSTRAINT_NAME, knex);
  }

  if (await knex.schema.hasTable(TableName.PamAccount)) {
    await dropConstraintIfExists(TableName.PamAccount, ACCOUNT_CONSTRAINT_NAME, knex);

    // Restore the original project/folder-level uniqueness constraints
    const hasFolderId = await knex.schema.hasColumn(TableName.PamAccount, "folderId");
    const hasProjectId = await knex.schema.hasColumn(TableName.PamAccount, "projectId");
    const hasName = await knex.schema.hasColumn(TableName.PamAccount, "name");

    if (hasName && hasProjectId) {
      if (hasFolderId) {
        await knex.schema.alterTable(TableName.PamAccount, (table) => {
          table.unique(["projectId", "folderId", "name"], {
            indexName: "uidx_pam_account_children_name",
            predicate: knex.whereNotNull("folderId")
          });
        });
      }

      await knex.schema.alterTable(TableName.PamAccount, (table) => {
        table.unique(["projectId", "name"], {
          indexName: "uidx_pam_account_root_name",
          predicate: knex.whereNull("folderId")
        });
      });
    }
  }
}
