import { TDomainKeyStore } from "@app/domains/lib/key-store";
import { TLicenseService, TUsageMeteringService } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";

import { TAgentVaultAccessService, TAgentVaultUsageService } from "../ce/services/dependencies";
import { FreeUsageCache } from "./data-access/free-usage-cache";
import { AgentVaultAccessService } from "./services/access/service";
import { AgentVaultUsageService } from "./services/usage/service";

export type TAgentVaultDeps = {
  keyStore: TDomainKeyStore;
  licenseService: TLicenseService;
  usageMeteringService: TUsageMeteringService;
  organizationsProjectsService: TOrganizationsProjectsService;
};

export class AgentVaultModule {
  readonly agentVaultAccessService: TAgentVaultAccessService;

  readonly agentVaultUsageService: TAgentVaultUsageService;

  constructor({ keyStore, licenseService, usageMeteringService, organizationsProjectsService }: TAgentVaultDeps) {
    const freeUsageCache = new FreeUsageCache(keyStore);
    this.agentVaultAccessService = new AgentVaultAccessService(
      licenseService,
      organizationsProjectsService,
      freeUsageCache
    );
    this.agentVaultUsageService = new AgentVaultUsageService(
      licenseService,
      usageMeteringService,
      organizationsProjectsService,
      freeUsageCache
    );
  }
}
