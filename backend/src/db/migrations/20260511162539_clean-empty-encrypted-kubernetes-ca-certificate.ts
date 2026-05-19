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

export async function up(knex: Knex): Promise<void> {
  const records = await knex(TableName.IdentityKubernetesAuth)
    .join(TableName.Identity, `${TableName.IdentityKubernetesAuth}.identityId`, `${TableName.Identity}.id`)
    .whereNotNull(`${TableName.IdentityKubernetesAuth}.encryptedKubernetesCaCertificate`)
    .select(
      `${TableName.IdentityKubernetesAuth}.id`,
      `${TableName.IdentityKubernetesAuth}.encryptedKubernetesCaCertificate`,
      `${TableName.Identity}.orgId`
    );

  if (!records.length) return;

  initLogger();

  const { hsmService } = await getMigrationHsmService({ envConfig: getMigrationHsmConfig() });
  const superAdminDAL = superAdminDALFactory(knex);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(knex);
  const envConfig = await getMigrationEnvConfig(superAdminDAL, hsmService, kmsRootConfigDAL);
  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });
  const orgKmsCache = createCircularCache<Awaited<ReturnType<(typeof kmsService)["createCipherPairWithDataKey"]>>>(25);

  const toNullify: string[] = [];

  for (const record of records) {
    let orgKms = orgKmsCache.getItem(record.orgId);
    if (!orgKms) {
      // eslint-disable-next-line no-await-in-loop
      orgKms = await kmsService.createCipherPairWithDataKey(
        { type: KmsDataKey.Organization, orgId: record.orgId },
        knex
      );
      orgKmsCache.push(record.orgId, orgKms);
    }

    let decrypted: string;
    try {
      decrypted = orgKms.decryptor({ cipherTextBlob: record.encryptedKubernetesCaCertificate }).toString();
    } catch (err) {
      logger.error(err, `Migration failed to decrypt encryptedKubernetesCaCertificate [id=${record.id}]`);
      throw err;
    }

    if (decrypted === "") {
      toNullify.push(record.id);
    }
  }

  if (!toNullify.length) return;

  await knex.transaction(async (trx) => {
    for (let i = 0; i < toNullify.length; i += BATCH_SIZE) {
      // eslint-disable-next-line no-await-in-loop
      await trx(TableName.IdentityKubernetesAuth)
        .whereIn("id", toNullify.slice(i, i + BATCH_SIZE))
        .update({ encryptedKubernetesCaCertificate: null, verifyTlsCertificate: false });
    }
  });
}

export async function down(): Promise<void> {
  // The original encrypted-empty-string values cannot be restored once nulled — down is a no-op.
}
