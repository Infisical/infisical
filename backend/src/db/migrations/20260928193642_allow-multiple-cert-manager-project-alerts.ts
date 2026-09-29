import { Knex } from "knex";

import { initLogger, logger } from "@app/lib/logger";

import { TableName } from "../schemas";

const CERTIFICATE_RESOURCE_TYPE = "cert-manager.certificate";

const recreateUniqueScopeIndex = async (knex: Knex, where: string) => {
  await knex.schema.raw(`DROP INDEX IF EXISTS "alert_unique_scope_resource_event"`);
  await knex.schema.raw(
    `CREATE UNIQUE INDEX "alert_unique_scope_resource_event" ON "${TableName.Alert}"
     ("orgId", (COALESCE("projectId", '')), "resourceType", (COALESCE("resourceId", '')), "eventType") ${where}`
  );
};

export async function up(knex: Knex): Promise<void> {
  await recreateUniqueScopeIndex(
    knex,
    `WHERE "resourceType" NOT IN ('cert-manager.application', '${CERTIFICATE_RESOURCE_TYPE}')`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex(TableName.EventOutbox).where("eventType", "like", `${CERTIFICATE_RESOURCE_TYPE}.%`).delete();

  const duplicate = await knex(TableName.Alert)
    .where({ resourceType: CERTIFICATE_RESOURCE_TYPE })
    .groupByRaw(`"orgId", COALESCE("projectId", ''), COALESCE("resourceId", ''), "eventType"`)
    .havingRaw("count(*) > 1")
    .first(knex.raw("1"));
  if (duplicate) {
    initLogger();
    logger.warn(
      "Kept the alert_unique_scope_resource_event index exemption for project certificate alerts because a project has several alerts for the same event"
    );
    return;
  }

  await recreateUniqueScopeIndex(knex, `WHERE "resourceType" <> 'cert-manager.application'`);
}
