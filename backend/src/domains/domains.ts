import { TDbClient } from "@app/db";
import { TEnvConfig } from "@app/lib/config/env";
import { startLocalRefresh } from "@app/lib/cron/local-refresh";

import { AgentVaultModule } from "./agent-vault/agent-vault/ee/module";
import { CertManagerModule } from "./certificates/cert-manager/ce/module";
import { TDomainCron, TDomainQueue } from "./lib/jobs";
import { TDomainKeyStore } from "./lib/key-store";
import { PamModule } from "./pam/pam/ce/module";
import { LicenseModule, TLicenseServerBilling } from "./platform/license/ce/module";
import { LicenseEeModule } from "./platform/license/ee/module";
import { OrganizationsProjectsModule } from "./platform/organizations-projects/ce/module";
import { SecretsModule } from "./secrets-manager/secrets/ce/module";

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
  >;
};

// Only file outside a domain that imports ee/. Products build before License and hand it their counters;
// a product that needs License builds after it, so its counters have to come from data access.
export const createDomains = async (deps: TDomainDeps) => {
  const organizationsProjects = new OrganizationsProjectsModule({ db: deps.db });
  const { organizationsProjectsService } = organizationsProjects;
  const secrets = new SecretsModule({ organizationsProjectsService });
  const pam = new PamModule({ organizationsProjectsService });
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
    usageCounters: [...secrets.usageCounters, ...pam.usageCounters, ...certManager.usageCounters]
  });

  // Subscriptions are managed on the EE client itself; License never calls its billing methods.
  const licenseBilling: TLicenseServerBilling = licenseEe.licenseServerClient;

  const agentVault = new AgentVaultModule({
    keyStore: deps.keyStore,
    licenseService: license.licenseService,
    usageMeteringService: license.usageMeteringService,
    organizationsProjectsService
  });

  return { license, licenseBilling, organizationsProjects, certManager, agentVault };
};
