import { TDomainKeyStore } from "@app/domains/lib/key-store";
import { TLicenseService, TUsageMeteringService } from "@app/domains/platform/license/ce/module";
import { TOrganizationsService } from "@app/domains/platform/organizations/ce/module";

import { TAgentVaultAccessService, TAgentVaultUsageService } from "../ce/services/dependencies";
import { FreeUsageCache } from "./data-access/free-usage-cache";
import { AgentVaultAccessService } from "./services/access/service";
import { AgentVaultUsageService } from "./services/usage/service";

export type TAgentVaultDeps = {
  keyStore: TDomainKeyStore;
  licenseService: TLicenseService;
  usageMeteringService: TUsageMeteringService;
  organizationsService: TOrganizationsService;
};

export class AgentVaultEeModule {
  readonly agentVaultAccessService: TAgentVaultAccessService;

  readonly agentVaultUsageService: TAgentVaultUsageService;

  constructor({ keyStore, licenseService, usageMeteringService, organizationsService }: TAgentVaultDeps) {
    const freeUsageCache = new FreeUsageCache(keyStore);
    this.agentVaultAccessService = new AgentVaultAccessService(licenseService, organizationsService, freeUsageCache);
    this.agentVaultUsageService = new AgentVaultUsageService(
      licenseService,
      usageMeteringService,
      organizationsService,
      freeUsageCache
    );
  }
}
