import { TDbClient } from "@app/db";
import { TEnvConfig } from "@app/lib/config/env";
import { TCronJobFactory } from "@app/lib/cron/cron-job";
import { startLocalRefresh } from "@app/lib/cron/local-refresh";
import { TQueueServiceFactory } from "@app/queue";

import { AgentVaultModule } from "./agent-vault/agent-vault/ce/module";
import { CertManagerModule } from "./certificates/cert-manager/ce/module";
import { TDomainKeyStore } from "./lib/key-store";
import { PamModule } from "./pam/pam/ce/module";
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
  >;
};

export type TDomains = ReturnType<typeof createDomains>;

// Builds every domain in dependency order. The only file that imports ee/ from outside a domain.
//
// License comes first: every product depends on it, and it depends on none. Products plug in what License
// needs from them (usage counters, root orgs) through license.registry while they are built.
export const createDomains = (deps: TDomainDeps) => {
  const license = new LicenseModule({
    keyStore: deps.keyStore,
    queueService: deps.queueService,
    cronJob: deps.cronJob,
    isProductionMode: deps.envConfig.isProductionMode,
    startLocalRefresh,
    hooks: new LicenseEeModule({ envConfig: deps.envConfig, keyStore: deps.keyStore }).hooks
  });

  const organizationsProjects = new OrganizationsProjectsModule({ db: deps.db, license: license.registry });
  const productDeps = { organizationsProjects: organizationsProjects.service, license: license.registry };
  const secrets = new SecretsModule(productDeps);
  const pam = new PamModule(productDeps);
  const agentVault = new AgentVaultModule(productDeps);
  const certManager = new CertManagerModule({ db: deps.db, ...productDeps });

  return { license, organizationsProjects, secrets, pam, agentVault, certManager };
};
