import { Knex } from "knex";

import { inMemoryKeyStore } from "@app/keystore/memory";
import { initLogger } from "@app/lib/logger";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { TableName } from "../schemas";
import { getMigrationEnvConfig, getMigrationHsmConfig } from "./utils/env-config";
import { getMigrationEncryptionServices, getMigrationHsmService } from "./utils/services";

const BATCH_SIZE = 500;

export async function up(knex: Knex): Promise<void> {
  // Backfill discovery sources
  await knex(TableName.PamDiscoverySource)
    .whereRaw(`"discoveryConfiguration" IS NOT NULL AND ("discoveryConfiguration"::jsonb ->> 'useLdaps') IS NULL`)
    .update({
      discoveryConfiguration: knex.raw(
        `"discoveryConfiguration"::jsonb || '{
          "ldapPort": 636,
          "useLdaps": true,
          "ldapRejectUnauthorized": true,
          "winrmPort": 5986,
          "useWinrmHttps": true,
          "winrmRejectUnauthorized": true,
          "discoverDependencies": false
        }'::jsonb`
      )
    });

  // Backfill encrypted resource connection details
  const hasPamResourceTable = await knex.schema.hasTable(TableName.PamResource);
  if (!hasPamResourceTable) return;

  const resources = await knex(TableName.PamResource)
    .whereIn("resourceType", ["active-directory", "windows"])
    .whereNotNull("encryptedConnectionDetails")
    .select("id", "projectId", "resourceType", "encryptedConnectionDetails");

  if (!resources.length) return;

  initLogger();
  const { hsmService } = await getMigrationHsmService({ envConfig: getMigrationHsmConfig() });
  const superAdminDAL = superAdminDALFactory(knex);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(knex);
  const envConfig = await getMigrationEnvConfig(superAdminDAL, hsmService, kmsRootConfigDAL);
  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });

  const updates: { id: string; encryptedConnectionDetails: Buffer }[] = [];

  for (const resource of resources) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { decryptor, encryptor } = await kmsService.createCipherPairWithDataKey(
        { type: KmsDataKey.SecretManager, projectId: resource.projectId },
        knex
      );

      const decrypted = JSON.parse(decryptor({ cipherTextBlob: resource.encryptedConnectionDetails }).toString());

      let modified = false;

      if (resource.resourceType === "active-directory") {
        if (decrypted.useLdaps === undefined) {
          decrypted.useLdaps = true;
          modified = true;
        }
        if (decrypted.ldapRejectUnauthorized === undefined) {
          decrypted.ldapRejectUnauthorized = true;
          modified = true;
        }
      }

      if (resource.resourceType === "windows") {
        if (decrypted.winrmPort === undefined) {
          decrypted.winrmPort = 5986;
          modified = true;
        }
        if (decrypted.useWinrmHttps === undefined) {
          decrypted.useWinrmHttps = true;
          modified = true;
        }
        if (decrypted.winrmRejectUnauthorized === undefined) {
          decrypted.winrmRejectUnauthorized = true;
          modified = true;
        }
      }

      if (modified) {
        const encrypted = encryptor({ plainText: Buffer.from(JSON.stringify(decrypted)) }).cipherTextBlob;
        updates.push({ id: resource.id, encryptedConnectionDetails: encrypted });
      }
    } catch {
      // Skip resources that fail to decrypt
    }
  }

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);

    // eslint-disable-next-line no-await-in-loop
    await Promise.all(batch.map((u) => knex(TableName.PamResource).where("id", u.id).update(u)));
  }
}

export async function down(): Promise<void> {
  // No down migration needed
}
