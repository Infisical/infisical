import { Knex } from "knex";

import { inMemoryKeyStore } from "@app/keystore/memory";
import { selectAllTableCols } from "@app/lib/knex";
import { initLogger } from "@app/lib/logger";
import { ExternalMigrationProviders } from "@app/services/external-migration/external-migration-schemas";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";
import { getMigrationEnvConfig, getMigrationHsmConfig } from "./utils/env-config";
import { getMigrationEncryptionServices, getMigrationHsmService } from "./utils/services";

export async function up(knex: Knex): Promise<void> {
  initLogger();
  const { hsmService } = await getMigrationHsmService({ envConfig: getMigrationHsmConfig() });
  const superAdminDAL = superAdminDALFactory(knex);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(knex);
  const envConfig = await getMigrationEnvConfig(superAdminDAL, hsmService, kmsRootConfigDAL);
  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });

  if (!(await knex.schema.hasTable(TableName.ExternalMigrationConfig))) {
    await knex.schema.createTable(TableName.ExternalMigrationConfig, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");
      t.string("provider").notNullable();
      t.binary("encryptedConfig").notNullable();
      t.uuid("connectionId");
      t.foreign("connectionId").references("id").inTable(TableName.AppConnection);
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.ExternalMigrationConfig);

    if (await knex.schema.hasTable(TableName.VaultExternalMigrationConfig)) {
      const existingVaultConfigs = await knex(TableName.VaultExternalMigrationConfig).select(
        selectAllTableCols(TableName.VaultExternalMigrationConfig)
      );

      await Promise.all(
        existingVaultConfigs.map(async (vaultConfig) => {
          const { encryptor } = await kmsService.createCipherPairWithDataKey({
            orgId: vaultConfig.orgId,
            type: KmsDataKey.Organization
          });

          const config = {
            namespace: vaultConfig.namespace
          };
          const { cipherTextBlob: encryptedConfig } = encryptor({ plainText: Buffer.from(JSON.stringify(config)) });

          await knex(TableName.ExternalMigrationConfig).insert({
            orgId: vaultConfig.orgId,
            provider: ExternalMigrationProviders.Vault,
            encryptedConfig,
            connectionId: vaultConfig.connectionId
          });
        })
      );
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ExternalMigrationConfig);
  await dropOnUpdateTrigger(knex, TableName.ExternalMigrationConfig);
}
