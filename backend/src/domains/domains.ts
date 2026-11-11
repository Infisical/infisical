import type { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  getConfig,
  getOriginalConfig,
  overridableKeys,
  overrideEnvConfig,
  overwriteSchema,
  parseWithOverrides,
  TEnvConfig
} from "@app/lib/config/env";
import { TCronJobFactory } from "@app/lib/cron/cron-job";
import { startLocalRefresh } from "@app/lib/cron/local-refresh";
import { TQueueServiceFactory } from "@app/queue";
import type { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";

import { AgentVaultModule } from "./agent-vault/agent-vault/ce/module";
import { CertManagerModule } from "./certificates/cert-manager/ce/module";
import { CodeSigningModule } from "./certificates/code-signing/ce/module";
import { KmsModule } from "./kms/kms/ce/module";
import { actorContexts } from "./lib/actor-context";
import { DataAccessDb } from "./lib/data-access-db";
import { domainEventEmitter } from "./lib/event-emitter";
import { TDomainKeyStore } from "./lib/key-store";
import { PamModule } from "./pam/pam/ce/module";
import { AccessControlModule } from "./platform/access-control/ce/module";
import { InstanceConfigCoreModule, TInstanceConfigEnv } from "./platform/instance-config-core/ce/module";
import { KmsCoreModule, TKmsCoreDomain } from "./platform/kms-core/ce/module";
import { KmsCoreEeModule } from "./platform/kms-core/ee/module";
import { LicenseModule } from "./platform/license/ce/module";
import { LicenseEeModule } from "./platform/license/ee/module";
import { OrganizationsModule } from "./platform/organizations/ce/module";
import { ProjectsModule } from "./platform/projects/ce/module";
import { SecretScanningModule } from "./secrets-manager/secret-scanning/ce/module";
import { SecretsModule } from "./secrets-manager/secrets/ce/module";

export type TDomainDeps = {
  db: TDbClient;
  keyStore: TDomainKeyStore;
  queueService: Pick<TQueueServiceFactory, "queue" | "start">;
  cronJob: Pick<TCronJobFactory, "register">;
  // The outbox. Domains write their events on their own transactions through domainEventEmitter.
  eventEmitter: TEventEmitter;
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

// What Instance Config Core reads from and writes to the env holder in lib/config/env.ts.
const instanceConfigEnv: TInstanceConfigEnv = {
  getConfig,
  getOriginalConfig,
  overridableGroups: overwriteSchema,
  overridableKeys,
  parseWithOverrides,
  overrideEnvConfig
};

export type TDomains = ReturnType<typeof createDomains>;

// Builds every domain in dependency order. The only file that imports ee/ from outside a domain.
//
// License comes first: every product depends on it, and it depends on none. Products plug in what License
// needs from them (usage counters, root orgs) through license.registry while they are built.
export const createDomains = (deps: TDomainDeps) => {
  const licenseEe = new LicenseEeModule({ envConfig: deps.envConfig });
  const license = new LicenseModule({
    keyStore: deps.keyStore,
    queueService: deps.queueService,
    cronJob: deps.cronJob,
    isProductionMode: deps.envConfig.isProductionMode,
    startLocalRefresh,
    hooks: licenseEe.hooks
  });

  // KMS Core depends on no other domain. HSM and external keys plug in from its enterprise edition; boot starts
  // kmsCoreEe (with the instance's HSM entitlement from License) and then kmsCore.
  const db = DataAccessDb.fromClient(deps.db);
  const { kmsCoreEe, kmsCore } = buildKmsCore({ db, envConfig: deps.envConfig, cronJob: deps.cronJob });

  // Instance Config Core depends only on KMS Core, for the root key that encrypts credentials and env overrides.
  const instanceConfigCore = new InstanceConfigCoreModule({
    db,
    keyStore: deps.keyStore,
    kmsCoreDomain: kmsCore.service,
    env: instanceConfigEnv,
    startLocalRefresh
  });

  // Access Control is a base domain: memberships, roles, privileges, groups and attributes, and the building
  // blocks every scope owner's permission function uses. It depends on no other domain.
  const accessControl = new AccessControlModule({
    db,
    keyStore: deps.keyStore,
    eventEmitter: domainEventEmitter(deps.eventEmitter),
    // Tests see every change on the next request; production serves a validated permission for ten seconds.
    cacheMarkerTtlSeconds: deps.envConfig.isTestMode ? 0 : undefined
  });

  // Organizations is the top container; Projects sits below it and holds every product's projects.
  const organizations = new OrganizationsModule({ db, accessControlDomain: accessControl.service });
  const projects = new ProjectsModule({
    db,
    accessControlDomain: accessControl.service,
    organizationsDomain: organizations.service,
    licenseRegistry: license.registry
  });
  const productDeps = {
    projectsDomain: projects.service,
    accessControlDomain: accessControl.service,
    productAccessRegistry: projects.productAccessRegistry,
    licenseRegistry: license.registry
  };
  const secrets = new SecretsModule({ db, keyStore: deps.keyStore, ...productDeps });
  const pam = new PamModule(productDeps);
  const agentVault = new AgentVaultModule(productDeps);
  const kms = new KmsModule({
    projectsDomain: projects.service,
    productAccessRegistry: projects.productAccessRegistry
  });
  const secretScanning = new SecretScanningModule({ projectsDomain: projects.service });
  const codeSigning = new CodeSigningModule({ projectsDomain: projects.service });
  const certManager = new CertManagerModule({ db, organizationsDomain: organizations.service, ...productDeps });

  // Built once per request by the auth middleware, and by background jobs acting in an org.
  const actorContextBuilder = actorContexts({
    findActorOrg: (orgId) => organizations.service.findActorOrg({ orgId }),
    getPlan: (orgId) => license.service.getPlan(orgId),
    assertSessionAllowed: (input) => organizations.service.assertSessionAllowed(input)
  });

  return {
    actorContexts: actorContextBuilder,
    license,
    kmsCoreEe,
    kmsCore,
    instanceConfigCore,
    accessControl,
    organizations,
    projects,
    secrets,
    pam,
    agentVault,
    kms,
    codeSigning,
    secretScanning,
    certManager
  };
};
