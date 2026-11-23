import type { Knex } from "knex";

import { TDbClient } from "@app/db";
import { getOriginalConfig, TEnvConfig } from "@app/lib/config/env";
import { startLocalRefresh } from "@app/lib/cron/local-refresh";
import { crypto } from "@app/lib/crypto/cryptography";

import { AgentVaultEeModule, AgentVaultProjectRoles } from "./agent-vault/agent-vault/ee/module";
import { CertManagerModule } from "./certificates/cert-manager/ce/module";
import { CodeSigningModule } from "./certificates/code-signing/ce/module";
import { KmsModule, kmsProjectRoles } from "./kms/kms/ce/module";
import { TDomainCron, TDomainQueue } from "./lib/jobs";
import { TDomainKeyStore } from "./lib/key-store";
import { PamModule, PamProjectRoles } from "./pam/pam/ce/module";
import { AccessControlModule } from "./platform/access-control/ce/module";
import { InstanceConfigCoreModule } from "./platform/instance-config-core/ce/module";
import { KmsCoreModule } from "./platform/kms-core/ce/module";
import { ExternalKmsEeModule } from "./platform/kms-core/ee/external-kms-module";
import { KmsCoreEeModule } from "./platform/kms-core/ee/module";
import { InstanceFeature, LicenseModule, PlanFeature, TLicenseServerBilling } from "./platform/license/ce/module";
import { LicenseEeModule } from "./platform/license/ee/module";
import { OrganizationsModule } from "./platform/organizations/ce/module";
import { ProjectsModule } from "./platform/projects/ce/module";
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
    | "isTestMode"
  > &
    TKmsCoreEnvConfig;
};

const kmsCoreEnv = (envConfig: TKmsCoreEnvConfig) => ({
  ENCRYPTION_KEY: envConfig.ENCRYPTION_KEY,
  ROOT_ENCRYPTION_KEY: envConfig.ROOT_ENCRYPTION_KEY,
  KMS_ROOT_KEY_RETENTION_DAYS: envConfig.KMS_ROOT_KEY_RETENTION_DAYS,
  isHsmConfigured: envConfig.isHsmConfigured
});

// EE module first: the HSM may be what unwraps the root key.
const buildKmsCore = async ({
  db,
  readKnex,
  envConfig,
  isHsmEntitled,
  keyStore,
  skipRotationState
}: {
  db: TDbClient;
  readKnex: () => Knex;
  envConfig: TKmsCoreEnvConfig;
  isHsmEntitled: () => boolean;
  keyStore?: TDomainKeyStore;
  skipRotationState?: boolean;
}) => {
  const kmsCoreEe = await KmsCoreEeModule.create({ hsmConfig: envConfig, isHsmEntitled });
  const kmsCore = await KmsCoreModule.create({
    db,
    readKnex,
    env: kmsCoreEnv(envConfig),
    originalEnv: skipRotationState ? undefined : getOriginalConfig(),
    hooks: kmsCoreEe.hooks,
    keyStore,
    skipRotationState
  });
  return { kmsCoreEe, kmsCore };
};

// KMS Core for migrations and seed scripts. Every query runs on `db` (in a migration, its own transaction) and only
// the root key loads, since historical migrations predate rotation state. HSM counts as entitled: the license isn't
// read yet.
export const startStandaloneKmsCore = async ({
  db,
  envConfig
}: {
  db: Knex;
  envConfig: TKmsCoreEnvConfig;
}): Promise<KmsCoreModule> => {
  const { kmsCore } = await buildKmsCore({
    db,
    readKnex: () => db,
    envConfig,
    isHsmEntitled: () => true,
    skipRotationState: true
  });
  return kmsCore;
};

// Only file outside a domain that imports ee/. Products build before License and hand it their counters;
// a product that needs License builds after it, so its counters have to come from data access.
export const createDomains = async (deps: TDomainDeps) => {
  const accessControl = new AccessControlModule({
    db: deps.db,
    keyStore: deps.keyStore,
    // Tests check grants on every read, so a change shows on the next request.
    cacheMarkerTtlSeconds: deps.envConfig.isTestMode ? 0 : undefined
  });
  const organizations = new OrganizationsModule({
    db: deps.db,
    actorGrantsService: accessControl.actorGrantsService,
    roleService: accessControl.roleService
  });
  const { organizationsService } = organizations;
  const projects = new ProjectsModule({
    db: deps.db,
    keyStore: deps.keyStore,
    actorGrantsService: accessControl.actorGrantsService,
    roleService: accessControl.roleService,
    groupService: accessControl.groupService,
    orgPermissionService: organizations.orgPermissionService,
    projectRoles: [new PamProjectRoles(), new AgentVaultProjectRoles(), kmsProjectRoles],
    cacheMarkerTtlSeconds: deps.envConfig.isTestMode ? 0 : undefined
  });
  const { projectsService } = projects;
  const { projectPermissionService, projectResourcePermissionService } = projects;
  const secrets = new SecretsModule({
    db: deps.db,
    keyStore: deps.keyStore,
    projectPermissionService,
    actorGrantsService: accessControl.actorGrantsService,
    groupService: accessControl.groupService,
    projectsService,
    cacheMarkerTtlSeconds: deps.envConfig.isTestMode ? 0 : undefined
  });
  const pam = new PamModule({
    projectsService,
    projectResourcePermissionService,
    actorGrantsService: accessControl.actorGrantsService
  });
  const certManager = new CertManagerModule({ db: deps.db, organizationsService, projectResourcePermissionService });
  const codeSigning = new CodeSigningModule({ projectResourcePermissionService });
  const kms = new KmsModule({ projectPermissionService });

  const licenseEe = new LicenseEeModule({ envConfig: deps.envConfig });
  const license = await LicenseModule.create({
    keyStore: deps.keyStore,
    queueService: deps.queueService,
    cronJob: deps.cronJob,
    isProductionMode: deps.envConfig.isProductionMode,
    startLocalRefresh,
    licensePolicyService: licenseEe.licensePolicyService,
    licenseServer: licenseEe.licenseServerClient,
    organizationsService,
    projectsService,
    usageCounters: [...secrets.usageCounters, ...pam.usageCounters, ...certManager.usageCounters]
  });

  // Subscriptions are managed on the EE client itself; License never calls its billing methods.
  const licenseBilling: TLicenseServerBilling = licenseEe.licenseServerClient;

  const agentVault = new AgentVaultEeModule({
    keyStore: deps.keyStore,
    licenseService: license.licenseService,
    usageMeteringService: license.usageMeteringService,
    organizationsService,
    projectPermissionService,
    actorGrantsService: accessControl.actorGrantsService
  });

  // Before KMS Core writes the root key on a fresh instance: an unlicensed FIPS instance must refuse to boot before
  // anything gets wrapped with its FIPS-format key.
  crypto.verifyFipsLicense(license.licenseService.getInstanceEntitlements().has(InstanceFeature.Fips));

  // KMS Core depends on no other domain. Its EE edition (HSM, external keys) reads the HSM entitlement from License.
  const { kmsCoreEe, kmsCore } = await buildKmsCore({
    db: deps.db,
    readKnex: () => deps.db.replicaNode(),
    envConfig: deps.envConfig,
    isHsmEntitled: () => license.licenseService.getInstanceEntitlements().plan().has(PlanFeature.Hsm),
    keyStore: deps.keyStore
  });
  const externalKms = new ExternalKmsEeModule({
    db: deps.db,
    readKnex: () => deps.db.replicaNode(),
    kmsDataKeyService: kmsCore.kmsDataKeyService
  });

  const instanceConfigCore = await InstanceConfigCoreModule.create({
    db: deps.db,
    keyStore: deps.keyStore,
    kmsRootKeyService: kmsCore.kmsRootKeyService,
    // A copy taken at boot: the values an admin can override are parsed from it, overrides on top.
    processEnv: { ...process.env }
  });

  return {
    accessControl,
    license,
    licenseBilling,
    kmsCoreEe,
    kmsCore,
    externalKms,
    instanceConfigCore,
    organizations,
    projects,
    secrets,
    pam,
    certManager,
    codeSigning,
    kms,
    agentVault
  };
};

export type TDomains = Awaited<ReturnType<typeof createDomains>>;
