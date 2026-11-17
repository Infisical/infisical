/* eslint-disable no-await-in-loop -- batches run one after another on purpose */
import { Knex } from "knex";

import { inMemoryKeyStore } from "@app/keystore/memory";
import { initLogger, logger } from "@app/lib/logger";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { TableName } from "../schemas";
import { getMigrationEnvConfig, getMigrationHsmConfig } from "./utils/env-config";
import { createCircularCache } from "./utils/ring-buffer";
import { getMigrationEncryptionServices, getMigrationHsmService } from "./utils/services";

// Copied rather than imported so later changes to the sync or alert code can't change what this
// migration did.
const RESOURCE_TYPE = "secret.sync";
const EVENT_TYPE = "secret.sync.failed";
const ALERT_NAME = "Sync failure alert";
const PROJECT_ADMINS_PRINCIPAL_TYPE = "project-admins";
const BATCH_SIZE = 100;
const BATCH_STATEMENT_TIMEOUT_MS = 60_000;

type TSyncRow = {
  id: string;
  projectId: string;
  orgId: string;
};

// Every sync used to email its project's admins when a sync, import or remove failed after its retries. That
// email now comes from the shared alert module, so each existing sync gets the alert that reproduces it.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.SecretSync)) || !(await knex.schema.hasTable(TableName.Alert))) return;

  const hasSyncs = await knex(TableName.SecretSync).first("id");
  if (!hasSyncs) return;

  initLogger();

  const { hsmService } = await getMigrationHsmService({ envConfig: getMigrationHsmConfig() });
  const envConfig = await getMigrationEnvConfig(superAdminDALFactory(knex), hsmService, kmsRootConfigDALFactory(knex));
  const { kmsService } = await getMigrationEncryptionServices({
    envConfig,
    keyStore: inMemoryKeyStore(),
    db: knex,
    skipHsmLicenseCheck: true
  });
  const cipherCache = createCircularCache<Awaited<ReturnType<(typeof kmsService)["createCipherPairWithDataKey"]>>>(25);

  let lastId: string | undefined;
  let created = 0;

  for (;;) {
    const cursor = lastId;
    // A sync whose folder was deleted keeps running and failing (folderId is SET NULL), so it gets the alert too.
    const syncs = (await knex(TableName.SecretSync)
      .join(TableName.Project, `${TableName.SecretSync}.projectId`, `${TableName.Project}.id`)
      // Soft-deleted projects are being reaped, and the KMS lookup below can't see them.
      .whereNull(`${TableName.Project}.deleteAfter`)
      .modify((qb) => {
        if (cursor) void qb.where(`${TableName.SecretSync}.id`, ">", cursor);
      })
      .orderBy(`${TableName.SecretSync}.id`, "asc")
      .limit(BATCH_SIZE)
      .select(
        knex.ref("id").withSchema(TableName.SecretSync),
        knex.ref("id").withSchema(TableName.Project).as("projectId"),
        knex.ref("orgId").withSchema(TableName.Project).as("orgId")
      )) as TSyncRow[];
    if (syncs.length === 0) break;
    lastId = syncs[syncs.length - 1].id;

    // A rerun after a partial failure skips syncs that already have their alert.
    const alreadyMigrated = new Set(
      (
        await knex(TableName.Alert)
          .where({ resourceType: RESOURCE_TYPE, eventType: EVENT_TYPE })
          .whereIn(
            "resourceId",
            syncs.map((sync) => sync.id)
          )
          .select("resourceId")
      ).map((row) => row.resourceId as string)
    );
    const pending = syncs.filter((sync) => !alreadyMigrated.has(sync.id));
    if (pending.length === 0) continue;

    const encryptedEmptyConfigByProject = new Map<string, Buffer>();
    for (const projectId of new Set(pending.map((sync) => sync.projectId))) {
      let cipher = cipherCache.getItem(projectId);
      if (!cipher) {
        cipher = await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId }, knex);
        cipherCache.push(projectId, cipher);
      }
      encryptedEmptyConfigByProject.set(
        projectId,
        cipher.encryptor({ plainText: Buffer.from(JSON.stringify({})) }).cipherTextBlob
      );
    }

    await knex.transaction(async (tx) => {
      await tx.raw(`SET LOCAL statement_timeout = ${BATCH_STATEMENT_TIMEOUT_MS}`);
      for (const sync of pending) {
        const [alert] = (await tx(TableName.Alert)
          .insert({
            name: ALERT_NAME,
            resourceType: RESOURCE_TYPE,
            resourceId: sync.id,
            eventType: EVENT_TYPE,
            triggerType: "event",
            condition: null,
            enabled: true,
            orgId: sync.orgId,
            projectId: sync.projectId,
            createdByActorId: null,
            createdByActorType: "platform"
          })
          .returning("id")) as { id: string }[];

        const [channel] = (await tx(TableName.AlertChannel)
          .insert({
            name: "Email",
            channelType: "email",
            encryptedConfig: encryptedEmptyConfigByProject.get(sync.projectId) as Buffer,
            enabled: true,
            orgId: sync.orgId,
            projectId: sync.projectId,
            createdByActorId: null,
            createdByActorType: "platform"
          })
          .returning("id")) as { id: string }[];
        await tx(TableName.AlertChannelMembership).insert({ alertId: alert.id, channelId: channel.id });
        await tx(TableName.AlertChannelRecipient).insert({
          channelId: channel.id,
          principalType: PROJECT_ADMINS_PRINCIPAL_TYPE,
          principalId: sync.projectId
        });
      }
    });

    created += pending.length;
  }

  logger.info(`add-secret-sync-failure-alerts: created failure alerts for ${created} secret syncs`);
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Alert))) return;

  // Only the platform alerts that existed when this migration finished are its own. The record is named .ts
  // or .mjs depending on how the migrations were run.
  const record = await knex("infisical_migrations")
    .where("name", "like", "20261113120000_add-secret-sync-failure-alerts.%")
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
