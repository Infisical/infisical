import { TDbClient } from "@app/db";
import { TDomainKeyStore } from "@app/domains/lib/key-store";
import { TLicenseService, TUsageMeteringService } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";

import { TAgentVaultAccessService, TAgentVaultUsageService } from "../ce/services/dependencies";
import { GrandfatheredOrgCache } from "./data-access/grandfathered-org-cache";
import { GrandfatheredOrgStore } from "./data-access/grandfathered-org-store";
import { AgentVaultAccessService } from "./services/access/service";
import { AgentVaultUsageService } from "./services/usage/service";

export type TAgentVaultDeps = {
  db: TDbClient;
  keyStore: TDomainKeyStore;
  licenseService: TLicenseService;
  usageMeteringService: TUsageMeteringService;
  organizationsProjectsService: TOrganizationsProjectsService;
};

export class AgentVaultModule {
  readonly agentVaultAccessService: TAgentVaultAccessService;

  readonly agentVaultUsageService: TAgentVaultUsageService;

  constructor({ db, keyStore, licenseService, usageMeteringService, organizationsProjectsService }: TAgentVaultDeps) {
    this.agentVaultAccessService = new AgentVaultAccessService(
      licenseService,
      organizationsProjectsService,
      new GrandfatheredOrgStore(() => db.replicaNode()),
      new GrandfatheredOrgStore(() => db),
      new GrandfatheredOrgCache(keyStore)
    );
    this.agentVaultUsageService = new AgentVaultUsageService(licenseService, usageMeteringService);
  }
}
