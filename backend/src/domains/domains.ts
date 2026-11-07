import { TDbClient } from "@app/db";
import { TEnvConfig } from "@app/lib/config/env";
import { TCronJobFactory } from "@app/lib/cron/cron-job";
import { startLocalRefresh } from "@app/lib/cron/local-refresh";
import { TQueueServiceFactory } from "@app/queue";

import { AgentVaultModule } from "./agent-vault/agent-vault/ce/module";
import { CertManagerModule } from "./certificates/cert-manager/ce/module";
import { TDomainKeyStore } from "./lib/key-store";
import { PamModule } from "./pam/pam/ce/module";
import { LicenseModule, TRootOrg } from "./platform/license/ce/module";
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
  >;
  // Organizations and projects are not a domain yet, so their answers are passed in.
  resolveRootOrg: (orgId: string) => Promise<TRootOrg | null>;
  countBillableProjects: (rootOrgId: string) => Promise<number>;
};

export type TDomains = ReturnType<typeof createDomains>;

// Builds every domain in dependency order. The only file that imports ee/ from outside a domain.
export const createDomains = (deps: TDomainDeps) => {
  const organizationsProjects = new OrganizationsProjectsModule({ db: deps.db });
  const secrets = new SecretsModule({ organizationsProjects: organizationsProjects.service });
  const pam = new PamModule({ organizationsProjects: organizationsProjects.service });
  const agentVault = new AgentVaultModule({ organizationsProjects: organizationsProjects.service });
  const certManager = new CertManagerModule({
    db: deps.db,
    organizationsProjects: organizationsProjects.service
  });

  const license = new LicenseModule({
    keyStore: deps.keyStore,
    queueService: deps.queueService,
    cronJob: deps.cronJob,
    resolveRootOrg: deps.resolveRootOrg,
    countBillableProjects: deps.countBillableProjects,
    isProductionMode: deps.envConfig.isProductionMode,
    startLocalRefresh,
    counters: [
      ...organizationsProjects.usageCounters,
      ...secrets.usageCounters,
      ...pam.usageCounters,
      ...agentVault.usageCounters,
      ...certManager.usageCounters
    ],
    hooks: new LicenseEeModule({ envConfig: deps.envConfig, keyStore: deps.keyStore }).hooks
  });

  return { license, organizationsProjects, secrets, pam, agentVault, certManager };
};
