import { Knex } from "knex";

import { inMemoryKeyStore } from "@app/keystore/memory";
import { selectAllTableCols } from "@app/lib/knex";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { TableName } from "../schemas";
import { getMigrationEnvConfig } from "./utils/env-config";
import { getMigrationEncryptionServices } from "./utils/services";

export async function up(knex: Knex) {
  const existingSuperAdminsWithGithubConnection = await knex(TableName.SuperAdmin)
    .select(selectAllTableCols(TableName.SuperAdmin))
    .whereNotNull(`${TableName.SuperAdmin}.encryptedGitHubAppConnectionClientId`);

  const superAdminDAL = superAdminDALFactory(knex);
  const envConfig = await getMigrationEnvConfig(superAdminDAL);
  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });

  const decryptor = kmsService.decryptWithRootKey();
  const encryptor = kmsService.encryptWithRootKey();

  const tasks = existingSuperAdminsWithGithubConnection.map(async (admin) => {
    const overrides = (
      admin.encryptedEnvOverrides ? JSON.parse(decryptor(Buffer.from(admin.encryptedEnvOverrides)).toString()) : {}
    ) as Record<string, string>;

    if (admin.encryptedGitHubAppConnectionClientId) {
      overrides.INF_APP_CONNECTION_GITHUB_APP_CLIENT_ID = decryptor(
        admin.encryptedGitHubAppConnectionClientId
      ).toString();
    }

    if (admin.encryptedGitHubAppConnectionClientSecret) {
      overrides.INF_APP_CONNECTION_GITHUB_APP_CLIENT_SECRET = decryptor(
        admin.encryptedGitHubAppConnectionClientSecret
      ).toString();
    }

    if (admin.encryptedGitHubAppConnectionPrivateKey) {
      overrides.INF_APP_CONNECTION_GITHUB_APP_PRIVATE_KEY = decryptor(
        admin.encryptedGitHubAppConnectionPrivateKey
      ).toString();
    }

    if (admin.encryptedGitHubAppConnectionSlug) {
      overrides.INF_APP_CONNECTION_GITHUB_APP_SLUG = decryptor(admin.encryptedGitHubAppConnectionSlug).toString();
    }

    if (admin.encryptedGitHubAppConnectionId) {
      overrides.INF_APP_CONNECTION_GITHUB_APP_ID = decryptor(admin.encryptedGitHubAppConnectionId).toString();
    }

    const encryptedEnvOverrides = encryptor(Buffer.from(JSON.stringify(overrides)));

    await knex(TableName.SuperAdmin).where({ id: admin.id }).update({
      encryptedEnvOverrides
    });
  });

  await Promise.all(tasks);
}

export async function down() {
  // No down migration needed as this migration is only for data transformation
  // and does not change the schema.
}
