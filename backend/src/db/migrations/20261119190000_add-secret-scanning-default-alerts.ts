/* eslint-disable no-await-in-loop -- batches run one after another on purpose */
import { Knex } from "knex";

import { KmsDataKey } from "@app/domains/platform/kms-core/ce/module";
import {
  SECRET_SCANNING_DEFAULT_ALERTS,
  SECRET_SCANNING_RESOURCE_TYPE
} from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-events";
import { initLogger, logger } from "@app/lib/logger";

import { TableName } from "../schemas";
import { getMigrationEnvConfig } from "./utils/env-config";
import { createCircularCache } from "./utils/ring-buffer";
import { getMigrationEncryptionServices } from "./utils/services";

const PROJECT_ADMINS_PRINCIPAL_TYPE = "project-admins";
const BATCH_SIZE = 100;
const BATCH_STATEMENT_TIMEOUT_MS = 60_000;

type TDataSourceRow = {
  id: string;
  projectId: string;
  orgId: string;
};

// Every Secret Scanning project used to email its admins when a scan found secrets or failed. Those emails now
// come from the shared alert module, so each data source gets the alerts that reproduce them, like a new one does.
export async function up(knex: Knex): Promise<void> {
  if (
    !(await knex.schema.hasTable(TableName.SecretScanningDataSource)) ||
    !(await knex.schema.hasTable(TableName.Alert))
  )
    return;

  const hasDataSources = await knex(TableName.SecretScanningDataSource).first("id");
  if (!hasDataSources) return;

  initLogger();

  const envConfig = await getMigrationEnvConfig(knex);
  const { kmsDataKeyService } = await getMigrationEncryptionServices({ envConfig, db: knex });
  const cipherCache =
    createCircularCache<Awaited<ReturnType<(typeof kmsDataKeyService)["createCipherPairWithDataKey"]>>>(25);

  let lastId: string | undefined;
  let created = 0;

  for (;;) {
    const cursor = lastId;
    const dataSources = (await knex(TableName.SecretScanningDataSource)
      .join(TableName.Project, `${TableName.SecretScanningDataSource}.projectId`, `${TableName.Project}.id`)
      // Soft-deleted projects are being reaped, and the KMS lookup below can't see them.
      .whereNull(`${TableName.Project}.deleteAfter`)
      .modify((qb) => {
        if (cursor) void qb.where(`${TableName.SecretScanningDataSource}.id`, ">", cursor);
      })
      .orderBy(`${TableName.SecretScanningDataSource}.id`, "asc")
      .limit(BATCH_SIZE)
      .select(
        knex.ref("id").withSchema(TableName.SecretScanningDataSource),
        knex.ref("projectId").withSchema(TableName.SecretScanningDataSource),
        knex.ref("orgId").withSchema(TableName.Project)
      )) as TDataSourceRow[];

    if (dataSources.length === 0) break;
    lastId = dataSources[dataSources.length - 1].id;

    // A rerun after a partial failure skips data sources that already have their alerts.
    const alreadyMigrated = new Set(
      (
        await knex(TableName.Alert)
          .where({ resourceType: SECRET_SCANNING_RESOURCE_TYPE })
          .whereIn(
            "resourceId",
            dataSources.map((dataSource) => dataSource.id)
          )
          .distinct("resourceId")
      ).map((row) => row.resourceId as string)
    );
    const pending = dataSources.filter((dataSource) => !alreadyMigrated.has(dataSource.id));
    if (pending.length === 0) continue;

    const encryptedEmptyConfigByProject = new Map<string, Buffer>();
    for (const projectId of new Set(pending.map((dataSource) => dataSource.projectId))) {
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

      for (const dataSource of pending) {
        for (const { eventType, name } of SECRET_SCANNING_DEFAULT_ALERTS) {
          const [alert] = (await tx(TableName.Alert)
            .insert({
              name,
              resourceType: SECRET_SCANNING_RESOURCE_TYPE,
              resourceId: dataSource.id,
              eventType,
              triggerType: "event",
              condition: null,
              enabled: true,
              orgId: dataSource.orgId,
              projectId: dataSource.projectId,
              createdByActorId: null,
              createdByActorType: "platform"
            })
            .returning("id")) as { id: string }[];

          const [channel] = (await tx(TableName.AlertChannel)
            .insert({
              name: "Email",
              channelType: "email",
              encryptedConfig: encryptedEmptyConfigByProject.get(dataSource.projectId) as Buffer,
              enabled: true,
              orgId: dataSource.orgId,
              projectId: dataSource.projectId,
              createdByActorId: null,
              createdByActorType: "platform"
            })
            .returning("id")) as { id: string }[];

          await tx(TableName.AlertChannelMembership).insert({ alertId: alert.id, channelId: channel.id });
          await tx(TableName.AlertChannelRecipient).insert({
            channelId: channel.id,
            principalType: PROJECT_ADMINS_PRINCIPAL_TYPE,
            principalId: dataSource.projectId
          });
        }
      }
    });

    created += pending.length;
  }

  logger.info(`add-secret-scanning-default-alerts: created default alerts for ${created} Secret Scanning data sources`);
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Alert))) return;

  // Only the platform alerts that existed when this migration finished are its own. The record is named .ts
  // or .mjs depending on how the migrations were run.
  const record = await knex("infisical_migrations")
    .where("name", "like", "20261119190000_add-secret-scanning-default-alerts.%")
    .first("migration_time");
  if (!record) return;

  const backfilledAlerts = () =>
    knex(TableName.Alert)
      .where({ resourceType: SECRET_SCANNING_RESOURCE_TYPE, createdByActorType: "platform" })
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
