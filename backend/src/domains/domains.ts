import type { Knex } from "knex";

import { TDbClient } from "@app/db";
import { getOriginalConfig, TEnvConfig } from "@app/lib/config/env";
import { TCronJobFactory } from "@app/lib/cron/cron-job";
import { startLocalRefresh } from "@app/lib/cron/local-refresh";
import { TQueueServiceFactory } from "@app/queue";

import { AgentVaultModule } from "./agent-vault/agent-vault/ce/module";
import { CertManagerModule } from "./certificates/cert-manager/ce/module";
import { DataAccessDb } from "./lib/data-access-db";
import { TDomainKeyStore } from "./lib/key-store";
import { PamModule } from "./pam/pam/ce/module";
import { KmsCoreModule, TKmsCoreDomain } from "./platform/kms-core/ce/module";
import { KmsCoreEeModule } from "./platform/kms-core/ee/module";
import { LicenseModule } from "./platform/license/ce/module";
import { LicenseEeModule } from "./platform/license/ee/module";
import { OrganizationsProjectsModule } from "./platform/organizations-projects/ce/module";
import { SecretsModule } from "./secrets-manager/secrets/ce/module";

export type TDomainDeps = {
  db: TDbClient;
  keyStore: TDomainKeyStore;
  queueService: Pick<TQueueServiceFactory, "queue" | "start">;
  cronJob: Pick<TCronJobFactory, "register">;
  envConfig: Pick<
    TEnvConfig,
    | "LICENSE_KEY"
    | "LICENSE_KEY_OFFLINE"
    | "LICENSE_SERVER_V2_SERVICE_KEY"
    | "LICENSE_SERVER_URL"
    | "INTERNAL_REGION"
    | "isCloud"
    | "isProductionMode"
    | "ENCRYPTION_KEY"
    | "ROOT_ENCRYPTION_KEY"
    | "KMS_ROOT_KEY_RETENTION_DAYS"
    | "isHsmConfigured"
    | "HSM_PIN"
    | "HSM_SLOT"
    | "HSM_LIB_PATH"
    | "HSM_KEY_LABEL"
  >;
};

type TKmsCoreEnvConfig = Pick<
  TEnvConfig,
  | "ENCRYPTION_KEY"
  | "ROOT_ENCRYPTION_KEY"
  | "KMS_ROOT_KEY_RETENTION_DAYS"
  | "isHsmConfigured"
  | "HSM_PIN"
  | "HSM_SLOT"
  | "HSM_LIB_PATH"
  | "HSM_KEY_LABEL"
>;

const buildKmsCore = ({
  db,
  envConfig,
  cronJob
}: {
  db: DataAccessDb;
  envConfig: TKmsCoreEnvConfig;
  cronJob?: Pick<TCronJobFactory, "register">;
}) => {
  const kmsCoreEe = new KmsCoreEeModule({ db, hsmConfig: envConfig });
  const kmsCore = new KmsCoreModule({
    db,
    cronJob,
    env: {
      ENCRYPTION_KEY: envConfig.ENCRYPTION_KEY,
      ROOT_ENCRYPTION_KEY: envConfig.ROOT_ENCRYPTION_KEY,
      KMS_ROOT_KEY_RETENTION_DAYS: envConfig.KMS_ROOT_KEY_RETENTION_DAYS,
      isHsmConfigured: envConfig.isHsmConfigured
    },
    originalEnv: getOriginalConfig(),
    hooks: kmsCoreEe.hooks
  });
  return { kmsCoreEe, kmsCore };
};

// KMS Core for code that runs outside the server: migrations and seed scripts. Runs every query on `db`, which in a
// migration is the migration's own transaction, and loads only the root key (no rotation state, which historical
// migrations predate). HSM counts as entitled: the license has not been read yet.
export const startStandaloneKmsCore = async ({
  db,
  envConfig
}: {
  db: Knex;
  envConfig: TKmsCoreEnvConfig;
}): Promise<TKmsCoreDomain> => {
  const { kmsCoreEe, kmsCore } = buildKmsCore({ db: DataAccessDb.single(db), envConfig });
  await kmsCoreEe.start({ isHsmEntitled: () => true });
  await kmsCore.start({ skipRotationState: true });
  return kmsCore.service;
};

export type TDomains = ReturnType<typeof createDomains>;

// Builds every domain in dependency order. Only file outside a domain that imports ee/.
// License depends on no product: products build first and hand License their counters. A product that
// needs License builds after it, so its counters must come from data access, not a service using License.
export const createDomains = (deps: TDomainDeps) => {
  const db = DataAccessDb.fromClient(deps.db);
  const organizationsProjects = new OrganizationsProjectsModule({ db });
  const organizationsProjectsService = organizationsProjects.service;
  const secrets = new SecretsModule({ organizationsProjectsService });
  const pam = new PamModule({ organizationsProjectsService });
  const agentVault = new AgentVaultModule({ organizationsProjectsService });
  const certManager = new CertManagerModule({ db, organizationsProjectsService });

  const licenseEe = new LicenseEeModule({ envConfig: deps.envConfig });
  const license = new LicenseModule({
    keyStore: deps.keyStore,
    queueService: deps.queueService,
    cronJob: deps.cronJob,
    isProductionMode: deps.envConfig.isProductionMode,
    startLocalRefresh,
    provider: licenseEe.resolver,
    licenseServer: licenseEe.licenseServerClient,
    billing: licenseEe.licenseServerClient,
    organizations: organizationsProjectsService,
    usageCounters: [
      ...organizationsProjects.usageCounters,
      ...secrets.usageCounters,
      ...pam.usageCounters,
      ...agentVault.usageCounters,
      ...certManager.usageCounters
    ]
  });

  // KMS Core depends on no other domain. HSM and external keys plug in from its enterprise edition; boot starts
  // kmsCoreEe (with the instance's HSM entitlement from License) and then kmsCore.
  const { kmsCoreEe, kmsCore } = buildKmsCore({ db, envConfig: deps.envConfig, cronJob: deps.cronJob });

  return { license, kmsCoreEe, kmsCore, organizationsProjects, certManager };
};
