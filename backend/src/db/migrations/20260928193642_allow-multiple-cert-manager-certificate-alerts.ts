import { Knex } from "knex";

import { TableName } from "../schemas";

const CERTIFICATE_RESOURCE_TYPE = "cert-manager.certificate";

const recreateUniqueScopeIndex = async (knex: Knex, where = "") => {
  await knex.schema.raw(`DROP INDEX IF EXISTS "alert_unique_scope_resource_event"`);
  await knex.schema.raw(
    `CREATE UNIQUE INDEX "alert_unique_scope_resource_event" ON "${TableName.Alert}"
     ("orgId", (COALESCE("projectId", '')), "resourceType", (COALESCE("resourceId", '')), "eventType") ${where}`
  );
};

export async function up(knex: Knex): Promise<void> {
  await recreateUniqueScopeIndex(knex, `WHERE "resourceType" <> '${CERTIFICATE_RESOURCE_TYPE}'`);
}

export async function down(knex: Knex): Promise<void> {
  await recreateUniqueScopeIndex(knex);
}
