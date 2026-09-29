import { Knex } from "knex";

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
  const projectAlertIds = knex(TableName.Alert).where({ resourceType: CERTIFICATE_RESOURCE_TYPE }).select("id");

  await knex(TableName.AlertChannel)
    .whereIn("id", knex(TableName.AlertChannelMembership).whereIn("alertId", projectAlertIds).select("channelId"))
    .whereNotExists(
      knex(TableName.AlertChannelMembership)
        .join(TableName.Alert, `${TableName.AlertChannelMembership}.alertId`, `${TableName.Alert}.id`)
        .whereRaw(`??.?? = ??.??`, [TableName.AlertChannelMembership, "channelId", TableName.AlertChannel, "id"])
        .whereNot(`${TableName.Alert}.resourceType`, CERTIFICATE_RESOURCE_TYPE)
        .select(knex.raw("1"))
    )
    .delete();
  await knex(TableName.Alert).where({ resourceType: CERTIFICATE_RESOURCE_TYPE }).delete();
  await knex(TableName.EventOutbox).where("eventType", "like", `${CERTIFICATE_RESOURCE_TYPE}.%`).delete();

  await recreateUniqueScopeIndex(knex, `WHERE "resourceType" <> 'cert-manager.application'`);
}
