/* eslint-disable no-await-in-loop -- batches run one after another on purpose */
import { Knex } from "knex";

import { KmsDataKey } from "@app/domains/platform/kms-core/ce/module";
import { initLogger, logger } from "@app/lib/logger";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { TableName } from "../schemas";
import { getMigrationEnvConfig } from "./utils/env-config";
import { createCircularCache } from "./utils/ring-buffer";
import { getMigrationEncryptionServices } from "./utils/services";

// Copied rather than imported so later changes to the rotation or alert code can't change what this
// migration did.
const RESOURCE_TYPE = "secret.rotation";
const EVENT_TYPE = "secret.rotation.failed";
const ALERT_NAME = "Rotation failure alert";
const PROJECT_ADMINS_PRINCIPAL_TYPE = "project-admins";
const BATCH_SIZE = 100;
const BATCH_STATEMENT_TIMEOUT_MS = 60_000;

type TRotationRow = {
  id: string;
  projectId: string;
  orgId: string;
};

// Every rotation used to email its project's admins when a scheduled rotation failed. That email now comes
// from the shared alert module, so each existing rotation gets the alert that reproduces it.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretRotationV2)) || !(await knex.schema.hasTable(TableName.Alert)))
    return;

  const hasRotations = await knex(TableName.SecretRotationV2).first("id");
  if (!hasRotations) return;

  initLogger();

  const envConfig = await getMigrationEnvConfig(superAdminDALFactory(knex));
  const { kmsDataKeyService } = await getMigrationEncryptionServices({ envConfig, db: knex });
  const cipherCache =
    createCircularCache<Awaited<ReturnType<(typeof kmsDataKeyService)["createCipherPairWithDataKey"]>>>(25);

  let lastId: string | undefined;
  let created = 0;

  for (;;) {
    const cursor = lastId;
    const rotations = (await knex(TableName.SecretRotationV2)
      .join(TableName.SecretFolder, `${TableName.SecretRotationV2}.folderId`, `${TableName.SecretFolder}.id`)
      .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
      .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
      // Soft-deleted rows are being reaped, and the KMS lookup below can't see a soft-deleted project.
      .whereNull(`${TableName.Project}.deleteAfter`)
      .whereNull(`${TableName.Environment}.deleteAfter`)
      .modify((qb) => {
        if (cursor) void qb.where(`${TableName.SecretRotationV2}.id`, ">", cursor);
      })
      .orderBy(`${TableName.SecretRotationV2}.id`, "asc")
      .limit(BATCH_SIZE)
      .select(
        knex.ref("id").withSchema(TableName.SecretRotationV2),
        knex.ref("id").withSchema(TableName.Project).as("projectId"),
        knex.ref("orgId").withSchema(TableName.Project).as("orgId")
      )) as TRotationRow[];
    if (rotations.length === 0) break;
    lastId = rotations[rotations.length - 1].id;

    // A rerun after a partial failure skips rotations that already have their alert.
    const alreadyMigrated = new Set(
      (
        await knex(TableName.Alert)
          .where({ resourceType: RESOURCE_TYPE, eventType: EVENT_TYPE })
          .whereIn(
            "resourceId",
            rotations.map((rotation) => rotation.id)
          )
          .select("resourceId")
      ).map((row) => row.resourceId as string)
    );
    const pending = rotations.filter((rotation) => !alreadyMigrated.has(rotation.id));
    if (pending.length === 0) continue;

    const encryptedEmptyConfigByProject = new Map<string, Buffer>();
    for (const projectId of new Set(pending.map((rotation) => rotation.projectId))) {
      let cipher = cipherCache.getItem(projectId);
      if (!cipher) {
        cipher = await kmsDataKeyService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });
        cipherCache.push(projectId, cipher);
      }
      encryptedEmptyConfigByProject.set(
        projectId,
        cipher.encryptor({ plainText: Buffer.from(JSON.stringify({})) }).cipherTextBlob
      );
    }

    await knex.transaction(async (tx) => {
      await tx.raw(`SET LOCAL statement_timeout = ${BATCH_STATEMENT_TIMEOUT_MS}`);
      for (const rotation of pending) {
        const [alert] = (await tx(TableName.Alert)
          .insert({
            name: ALERT_NAME,
            resourceType: RESOURCE_TYPE,
            resourceId: rotation.id,
            eventType: EVENT_TYPE,
            triggerType: "event",
            condition: null,
            enabled: true,
            orgId: rotation.orgId,
            projectId: rotation.projectId,
            createdByActorId: null,
            createdByActorType: "platform"
          })
          .returning("id")) as { id: string }[];

        const [channel] = (await tx(TableName.AlertChannel)
          .insert({
            name: "Email",
            channelType: "email",
            encryptedConfig: encryptedEmptyConfigByProject.get(rotation.projectId) as Buffer,
            enabled: true,
            orgId: rotation.orgId,
            projectId: rotation.projectId,
            createdByActorId: null,
            createdByActorType: "platform"
          })
          .returning("id")) as { id: string }[];
        await tx(TableName.AlertChannelMembership).insert({ alertId: alert.id, channelId: channel.id });
        await tx(TableName.AlertChannelRecipient).insert({
          channelId: channel.id,
          principalType: PROJECT_ADMINS_PRINCIPAL_TYPE,
          principalId: rotation.projectId
        });
      }
    });

    created += pending.length;
  }

  logger.info(`add-secret-rotation-failure-alerts: created failure alerts for ${created} secret rotations`);
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Alert))) return;

  // Only the platform alerts that existed when this migration finished are its own. The record is named .ts
  // or .mjs depending on how the migrations were run.
  const record = await knex("infisical_migrations")
    .where("name", "like", "20261104120000_add-secret-rotation-failure-alerts.%")
    .first("migration_time");
  if (!record) return;

  const backfilledAlerts = () =>
    knex(TableName.Alert)
      .where({ resourceType: RESOURCE_TYPE, eventType: EVENT_TYPE, createdByActorType: "platform" })
      .whereNull("createdByActorId")
      .where("createdAt", "<=", record.migration_time);
  const channelIds = (await knex(TableName.AlertChannelMembership)
    .whereIn("alertId", backfilledAlerts().select("id"))
    .pluck("channelId")) as string[];

  await backfilledAlerts().delete();
  for (let i = 0; i < channelIds.length; i += BATCH_SIZE) {
    await knex(TableName.AlertChannel)
      .whereIn("id", channelIds.slice(i, i + BATCH_SIZE))
      .delete();
  }
}

const config = { transaction: false };
export { config };
