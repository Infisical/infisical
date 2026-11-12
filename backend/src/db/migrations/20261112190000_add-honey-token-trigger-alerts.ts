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

const RESOURCE_TYPE = "secret.honey-token";
const EVENT_TYPE = "secret.honey-token.triggered";
const ALERT_NAME = "Honey token trigger alert";
const PROJECT_ADMINS_PRINCIPAL_TYPE = "project-admins";
const REVOKED_STATUS = "revoked";
const BATCH_SIZE = 100;
const BATCH_STATEMENT_TIMEOUT_MS = 60_000;

type THoneyTokenRow = {
  id: string;
  projectId: string;
  orgId: string;
};

// Every honey token used to email its org's admins when it was triggered. That email now comes from the
// shared alert module, so each live honey token gets an alert emailing its project's admins. Revoked tokens
// can no longer trigger and can't be edited, so they get none. Tokens in an environment or project awaiting
// deletion do get one: their credentials stay live through the grace period, and a restore creates no alerts.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.HoneyToken)) || !(await knex.schema.hasTable(TableName.Alert))) return;

  const hasHoneyTokens = await knex(TableName.HoneyToken).whereNot("status", REVOKED_STATUS).first("id");
  if (!hasHoneyTokens) return;

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
    const honeyTokens = (await knex(TableName.HoneyToken)
      .join(TableName.SecretFolder, `${TableName.HoneyToken}.folderId`, `${TableName.SecretFolder}.id`)
      .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
      .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
      .whereNot(`${TableName.HoneyToken}.status`, REVOKED_STATUS)
      .modify((qb) => {
        if (cursor) void qb.where(`${TableName.HoneyToken}.id`, ">", cursor);
      })
      .orderBy(`${TableName.HoneyToken}.id`, "asc")
      .limit(BATCH_SIZE)
      .select(
        knex.ref("id").withSchema(TableName.HoneyToken),
        knex.ref("id").withSchema(TableName.Project).as("projectId"),
        knex.ref("orgId").withSchema(TableName.Project).as("orgId")
      )) as THoneyTokenRow[];
    if (honeyTokens.length === 0) break;
    lastId = honeyTokens[honeyTokens.length - 1].id;

    // A rerun after a partial failure skips tokens that already have their alert.
    const alreadyMigrated = new Set(
      (
        await knex(TableName.Alert)
          .where({ resourceType: RESOURCE_TYPE, eventType: EVENT_TYPE })
          .whereIn(
            "resourceId",
            honeyTokens.map((honeyToken) => honeyToken.id)
          )
          .select("resourceId")
      ).map((row) => row.resourceId as string)
    );
    const pending = honeyTokens.filter((honeyToken) => !alreadyMigrated.has(honeyToken.id));
    if (pending.length === 0) continue;

    const encryptedEmptyConfigByProject = new Map<string, Buffer>();
    for (const projectId of new Set(pending.map((honeyToken) => honeyToken.projectId))) {
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
      for (const honeyToken of pending) {
        const [alert] = (await tx(TableName.Alert)
          .insert({
            name: ALERT_NAME,
            resourceType: RESOURCE_TYPE,
            resourceId: honeyToken.id,
            eventType: EVENT_TYPE,
            triggerType: "event",
            condition: null,
            enabled: true,
            orgId: honeyToken.orgId,
            projectId: honeyToken.projectId,
            createdByActorId: null,
            createdByActorType: "platform"
          })
          .returning("id")) as { id: string }[];

        const [channel] = (await tx(TableName.AlertChannel)
          .insert({
            name: "Email",
            channelType: "email",
            encryptedConfig: encryptedEmptyConfigByProject.get(honeyToken.projectId) as Buffer,
            enabled: true,
            orgId: honeyToken.orgId,
            projectId: honeyToken.projectId,
            createdByActorId: null,
            createdByActorType: "platform"
          })
          .returning("id")) as { id: string }[];
        await tx(TableName.AlertChannelMembership).insert({ alertId: alert.id, channelId: channel.id });
        await tx(TableName.AlertChannelRecipient).insert({
          channelId: channel.id,
          principalType: PROJECT_ADMINS_PRINCIPAL_TYPE,
          principalId: honeyToken.projectId
        });
      }
    });

    created += pending.length;
  }

  logger.info(`add-honey-token-trigger-alerts: created trigger alerts for ${created} honey tokens`);
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Alert))) return;

  // Only the platform alerts that existed when this migration finished are its own. The record is named .ts
  // or .mjs depending on how the migrations were run.
  const record = await knex("infisical_migrations")
    .where("name", "like", "20261112190000_add-honey-token-trigger-alerts.%")
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
