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

const BATCH_SIZE = 500;

type TFindingRow = { id: string; projectId: string; details?: unknown; encryptedDetails?: Buffer };

type TProjectKms = Awaited<
  ReturnType<Awaited<ReturnType<typeof getMigrationEncryptionServices>>["kmsService"]["createCipherPairWithDataKey"]>
>;

// Walks the table in id order so a large findings table is never held in memory at once.
const rewriteFindings = async (
  knex: Knex,
  sourceColumn: "details" | "encryptedDetails",
  convert: (row: TFindingRow, projectKms: TProjectKms) => Record<string, unknown>
) => {
  const [{ count }] = await knex(TableName.SecretScanningFinding).count({ count: "*" });
  const batchCount = Math.ceil(Number(count) / BATCH_SIZE);
  if (!batchCount) return;

  initLogger();

  const { hsmService } = await getMigrationHsmService({ envConfig: getMigrationHsmConfig() });
  const superAdminDAL = superAdminDALFactory(knex);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(knex);
  const envConfig = await getMigrationEnvConfig(superAdminDAL, hsmService, kmsRootConfigDAL);
  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({
    envConfig,
    keyStore,
    db: knex,
    skipHsmLicenseCheck: true
  });
  const projectKmsCache = createCircularCache<TProjectKms>(25);

  let lastId: string | undefined;

  for (let batch = 0; batch < batchCount; batch += 1) {
    const query = knex(TableName.SecretScanningFinding)
      .select("id", "projectId", sourceColumn)
      .orderBy("id")
      .limit(BATCH_SIZE);
    if (lastId) void query.where("id", ">", lastId);

    // eslint-disable-next-line no-await-in-loop
    const rows = (await query) as TFindingRow[];
    if (!rows.length) break;

    const updates: { id: string; data: Record<string, unknown> }[] = [];

    for (const row of rows) {
      let projectKms = projectKmsCache.getItem(row.projectId);
      if (!projectKms) {
        // eslint-disable-next-line no-await-in-loop
        projectKms = await kmsService.createCipherPairWithDataKey(
          { type: KmsDataKey.SecretManager, projectId: row.projectId },
          knex
        );
        projectKmsCache.push(row.projectId, projectKms);
      }

      try {
        updates.push({ id: row.id, data: convert(row, projectKms) });
      } catch (err) {
        logger.error(err, `Migration failed to convert secret scanning finding details [findingId=${row.id}]`);
        throw err;
      }
    }

    // eslint-disable-next-line no-await-in-loop
    await knex.transaction(async (trx) => {
      await Promise.all(
        updates.map((update) => trx(TableName.SecretScanningFinding).where({ id: update.id }).update(update.data))
      );
    });

    lastId = rows[rows.length - 1].id;
  }
};

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.SecretScanningFinding, "encryptedDetails"))) {
    await knex.schema.alterTable(TableName.SecretScanningFinding, (t) => {
      t.binary("encryptedDetails");
    });
  }

  if (!(await knex.schema.hasColumn(TableName.SecretScanningFinding, "details"))) return;

  await rewriteFindings(knex, "details", (row, projectKms) => ({
    encryptedDetails: projectKms.encryptor({ plainText: Buffer.from(JSON.stringify(row.details ?? {})) }).cipherTextBlob
  }));

  await knex.schema.alterTable(TableName.SecretScanningFinding, (t) => {
    t.binary("encryptedDetails").notNullable().alter();
    t.dropColumn("details");
  });
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.SecretScanningFinding, "details"))) {
    await knex.schema.alterTable(TableName.SecretScanningFinding, (t) => {
      t.jsonb("details");
    });
  }

  if (!(await knex.schema.hasColumn(TableName.SecretScanningFinding, "encryptedDetails"))) return;

  // Findings collected after the up migration carry the detected secret, which must not land in plaintext.
  await rewriteFindings(knex, "encryptedDetails", (row, projectKms) => {
    const { secret, match, ...details } = JSON.parse(
      projectKms.decryptor({ cipherTextBlob: row.encryptedDetails as Buffer }).toString()
    ) as Record<string, unknown>;

    return { details: JSON.stringify(details) };
  });

  await knex.schema.alterTable(TableName.SecretScanningFinding, (t) => {
    t.jsonb("details").notNullable().alter();
    t.dropColumn("encryptedDetails");
  });
}
