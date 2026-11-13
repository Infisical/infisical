import type { Knex } from "knex";

import { TDbClient } from "@app/db";
import { getOriginalConfig, TEnvConfig } from "@app/lib/config/env";
import { startLocalRefresh } from "@app/lib/cron/local-refresh";

import { AgentVaultModule } from "./agent-vault/agent-vault/ce/module";
import { CertManagerModule } from "./certificates/cert-manager/ce/module";
import { TDomainCron, TDomainQueue } from "./lib/jobs";
import { TDomainKeyStore } from "./lib/key-store";
import { PamModule } from "./pam/pam/ce/module";
import { KmsCoreModule, TKmsCoreDomain } from "./platform/kms-core/ce/module";
import { KmsCoreEeModule } from "./platform/kms-core/ee/module";
import { LicenseModule, PlanFeature, TLicenseServerBilling } from "./platform/license/ce/module";
import { LicenseEeModule } from "./platform/license/ee/module";
import { OrganizationsProjectsModule } from "./platform/organizations-projects/ce/module";
import { SecretsModule } from "./secrets-manager/secrets/ce/module";

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

export type TDomainDeps = {
  db: TDbClient;
  keyStore: TDomainKeyStore;
  queueService: TDomainQueue;
  cronJob: TDomainCron;
  envConfig: Pick<
    TEnvConfig,
    | "LICENSE_KEY"
    | "LICENSE_KEY_OFFLINE"
    | "LICENSE_SERVER_V2_SERVICE_KEY"
    | "LICENSE_SERVER_URL"
    | "INTERNAL_REGION"
    | "isCloud"
    | "isProductionMode"
  > &
    TKmsCoreEnvConfig;
};

const kmsCoreEnv = (envConfig: TKmsCoreEnvConfig) => ({
  ENCRYPTION_KEY: envConfig.ENCRYPTION_KEY,
  ROOT_ENCRYPTION_KEY: envConfig.ROOT_ENCRYPTION_KEY,
  KMS_ROOT_KEY_RETENTION_DAYS: envConfig.KMS_ROOT_KEY_RETENTION_DAYS,
  isHsmConfigured: envConfig.isHsmConfigured
});

// The enterprise module comes first: the HSM may be what unwraps the root key.
const buildKmsCore = async ({
  db,
  readKnex,
  envConfig,
  isHsmEntitled,
  skipRotationState
}: {
  db: TDbClient;
  readKnex: () => Knex;
  envConfig: TKmsCoreEnvConfig;
  isHsmEntitled: () => boolean;
  skipRotationState?: boolean;
}) => {
  const kmsCoreEe = await KmsCoreEeModule.create({ db, readKnex, hsmConfig: envConfig, isHsmEntitled });
  const kmsCore = await KmsCoreModule.create({
    db,
    readKnex,
    env: kmsCoreEnv(envConfig),
    originalEnv: skipRotationState ? undefined : getOriginalConfig(),
    hooks: kmsCoreEe.hooks,
    skipRotationState
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
  const { kmsCore } = await buildKmsCore({
    db,
    readKnex: () => db,
    envConfig,
    isHsmEntitled: () => true,
    skipRotationState: true
  });
  return kmsCore.service;
};

// Only file outside a domain that imports ee/. Products build before License and hand it their counters;
// a product that needs License builds after it, so its counters have to come from data access.
export const createDomains = async (deps: TDomainDeps) => {
  const organizationsProjects = new OrganizationsProjectsModule({ db: deps.db });
  const { organizationsProjectsService } = organizationsProjects;
  const secrets = new SecretsModule({ organizationsProjectsService });
  const pam = new PamModule({ organizationsProjectsService });
  const agentVault = new AgentVaultModule({ organizationsProjectsService });
  const certManager = new CertManagerModule({ db: deps.db, organizationsProjectsService });

  const licenseEe = new LicenseEeModule({ envConfig: deps.envConfig });
  const license = await LicenseModule.create({
    keyStore: deps.keyStore,
    queueService: deps.queueService,
    cronJob: deps.cronJob,
    isProductionMode: deps.envConfig.isProductionMode,
    startLocalRefresh,
    licensePolicyService: licenseEe.licensePolicyService,
    licenseServer: licenseEe.licenseServerClient,
    organizationsProjectsService,
    usageCounters: [
      ...secrets.usageCounters,
      ...pam.usageCounters,
      ...agentVault.usageCounters,
      ...certManager.usageCounters
    ]
  });

  // Subscriptions are managed on the EE client itself; License never calls its billing methods.
  const licenseBilling: TLicenseServerBilling = licenseEe.licenseServerClient;

  // KMS Core depends on no other domain. HSM and external keys plug in from its enterprise edition, which reads the
  // instance's HSM entitlement from License.
  const { kmsCoreEe, kmsCore } = await buildKmsCore({
    db: deps.db,
    readKnex: () => deps.db.replicaNode(),
    envConfig: deps.envConfig,
    isHsmEntitled: () => license.licenseService.getInstanceEntitlements().plan().has(PlanFeature.Hsm)
  });
  kmsCore.start(deps.cronJob);

  return { license, licenseBilling, kmsCoreEe, kmsCore, organizationsProjects, certManager };
};
