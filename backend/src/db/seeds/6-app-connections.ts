import { Knex } from "knex";

import { inMemoryKeyStore } from "@app/keystore/memory";
import { initLogger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import { kmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { SECRET_SYNC_CONNECTION_MAP } from "@app/services/secret-sync/secret-sync-maps";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { getMigrationEnvConfig, getMigrationHsmConfig } from "../migrations/utils/env-config";
import { getMigrationEncryptionServices, getMigrationHsmService } from "../migrations/utils/services";
import { TableName } from "../schemas";

// Default auth method per provider — mirrors the first/default value from each
// provider's *-connection-enums.ts. The DB stores `method` as a plain string,
// so no per-provider enum imports are needed.
const DEFAULT_METHOD_BY_APP: Partial<Record<AppConnection, string>> = {
  [AppConnection.AWS]: "access-key",
  [AppConnection.GitHub]: "github-app",
  [AppConnection.GCP]: "service-account-impersonation",
  [AppConnection.AzureKeyVault]: "client-secret",
  [AppConnection.AzureAppConfiguration]: "client-secret",
  [AppConnection.AzureDevOps]: "access-token",
  [AppConnection.Databricks]: "service-principal",
  [AppConnection.Humanitec]: "api-token",
  [AppConnection.TerraformCloud]: "api-token",
  [AppConnection.Camunda]: "client-credentials",
  [AppConnection.Vercel]: "api-token",
  [AppConnection.Windmill]: "access-token",
  [AppConnection.HCVault]: "access-token",
  [AppConnection.TeamCity]: "access-token",
  [AppConnection.OCI]: "access-key",
  [AppConnection.OnePass]: "api-token",
  [AppConnection.Heroku]: "auth-token",
  [AppConnection.Render]: "api-key",
  [AppConnection.Flyio]: "access-token",
  [AppConnection.GitLab]: "access-token",
  [AppConnection.Cloudflare]: "api-token",
  [AppConnection.Supabase]: "access-token",
  [AppConnection.Zabbix]: "api-token",
  [AppConnection.Railway]: "account-token",
  [AppConnection.Checkly]: "api-key",
  [AppConnection.DigitalOcean]: "api-token",
  [AppConnection.Netlify]: "access-token",
  [AppConnection.Northflank]: "api-token",
  [AppConnection.Bitbucket]: "api-token",
  [AppConnection.LaravelForge]: "api-token",
  [AppConnection.Chef]: "user-key",
  [AppConnection.OctopusDeploy]: "api-key",
  [AppConnection.CircleCI]: "api-token",
  [AppConnection.AzureEntraId]: "client-secret",
  [AppConnection.ExternalInfisical]: "machine-identity-universal-auth",
  [AppConnection.OVH]: "certificate",
  [AppConnection.Devin]: "api-key",
  [AppConnection.Ona]: "personal-access-token",
  [AppConnection.TravisCI]: "api-token",
  [AppConnection.Snowflake]: "username-and-token"
};

export async function seed(knex: Knex): Promise<void> {
  initLogger();

  // The KMS service uses db.replicaNode() for reads. The knex instance handed
  // to seeds doesn't have it patched on, so we add it inline (same pattern as
  // migrations that need read-side access, e.g. 20250513081738_remove-gateway-project-link.ts).
  // eslint-disable-next-line no-param-reassign
  knex.replicaNode = () => knex;

  const superAdminDAL = superAdminDALFactory(knex);
  const kmsRootConfigDAL = kmsRootConfigDALFactory(knex);

  const { hsmService } = await getMigrationHsmService({ envConfig: getMigrationHsmConfig() });
  const envConfig = await getMigrationEnvConfig(superAdminDAL, hsmService, kmsRootConfigDAL);
  const keyStore = inMemoryKeyStore();
  const { kmsService } = await getMigrationEncryptionServices({ envConfig, keyStore, db: knex });

  const orgId = "373ec1de-d16e-48d1-9261-2c4264aac691";

  await knex(TableName.AppConnection).where({ orgId }).whereILike("name", "Dummy %").del();

  // All 40 connections are org-scoped (projectId=null) so they share the same
  // KMS data key. Build the encryptor once instead of inside the loop.
  const { encryptor } = await kmsService.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId });

  // Form flow only decrypts + JSON.parses at sync-create time (no Zod validation),
  // so an empty object is sufficient. Background sync jobs will fail — expected.
  const dummyCredentialsBlob = Buffer.from(JSON.stringify({}));

  // Stable, recognizable IDs of the form 00000000-0000-0000-0000-000000000001..N.
  // The dummy-stub Fastify hook detects requests against these IDs and returns canned
  // fixtures without hitting any external provider API.
  const dummyId = (n: number) => `00000000-0000-0000-0000-${n.toString().padStart(12, "0")}`;

  const uniqueApps = Array.from(new Set(Object.values(SECRET_SYNC_CONNECTION_MAP)));

  const rows = uniqueApps.map((app, idx) => {
    const method = DEFAULT_METHOD_BY_APP[app];
    if (!method) {
      throw new Error(`Missing default method for AppConnection "${app}" in 6-app-connections seed`);
    }

    const { cipherTextBlob: encryptedCredentials } = encryptor({ plainText: dummyCredentialsBlob });

    return {
      id: dummyId(idx + 1),
      name: `Dummy ${APP_CONNECTION_NAME_MAP[app]}`,
      app,
      method,
      encryptedCredentials,
      orgId,
      version: 1
    };
  });

  await knex(TableName.AppConnection).insert(rows);
}
