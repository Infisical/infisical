import { Knex } from "knex";

import { KmsDataKey } from "@app/domains/platform/kms-core/ce/module";
import { initLogger } from "@app/lib/logger";
import { ExternalMigrationProviders } from "@app/services/external-migration/external-migration-schemas";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";
import { getMigrationEnvConfig } from "./utils/env-config";
import { getMigrationEncryptionServices } from "./utils/services";

// Dropped by the 20260910093000 migration, so it no longer has a TableName entry.
const VAULT_EXTERNAL_MIGRATION_CONFIGS = "vault_external_migration_configs";

export async function up(knex: Knex): Promise<void> {
  initLogger();
  const superAdminDAL = superAdminDALFactory(knex);
  const envConfig = await getMigrationEnvConfig(superAdminDAL);
  const { kmsCoreDomain } = await getMigrationEncryptionServices({ envConfig, db: knex });

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

    if (await knex.schema.hasTable(VAULT_EXTERNAL_MIGRATION_CONFIGS)) {
      const existingVaultConfigs = await knex
        .select<{ orgId: string; namespace: string; connectionId?: string | null }[]>("*")
        .from(VAULT_EXTERNAL_MIGRATION_CONFIGS);

      await Promise.all(
        existingVaultConfigs.map(async (vaultConfig) => {
          const { encryptor } = await kmsCoreDomain.createCipherPairWithDataKey({
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
