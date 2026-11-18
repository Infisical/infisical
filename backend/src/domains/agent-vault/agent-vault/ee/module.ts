import { TDomainKeyStore } from "@app/domains/lib/key-store";
import { TActorGrantsService } from "@app/domains/platform/access-control/ce/module";
import { TLicenseService, TUsageMeteringService } from "@app/domains/platform/license/ce/module";
import { TOrganizationsService } from "@app/domains/platform/organizations/ce/module";
import { TProjectPermissionService } from "@app/domains/platform/projects/ce/module";

import {
  TAccessBundlePermissionService,
  TAgentVaultAccessService,
  TAgentVaultUsageService
} from "../ce/services/dependencies";
import { FreeUsageCache } from "./data-access/free-usage-cache";
import { AccessBundlePermissionService } from "./services/access-bundle-permission/service";
import { AgentVaultAccessService } from "./services/access/service";
import { AgentVaultUsageService } from "./services/usage/service";

export * from "./models/access-bundle-roles";
export * from "./models/agent-vault-project-roles";
export * from "./models/agent-vault-roles";

export type TAgentVaultDeps = {
  keyStore: TDomainKeyStore;
  licenseService: TLicenseService;
  usageMeteringService: TUsageMeteringService;
  organizationsService: TOrganizationsService;
  projectPermissionService: TProjectPermissionService;
  actorGrantsService: TActorGrantsService;
};

export class AgentVaultEeModule {
  readonly agentVaultAccessService: TAgentVaultAccessService;

  readonly agentVaultUsageService: TAgentVaultUsageService;

  readonly accessBundlePermissionService: TAccessBundlePermissionService;

  constructor({
    keyStore,
    licenseService,
    usageMeteringService,
    organizationsService,
    projectPermissionService,
    actorGrantsService
  }: TAgentVaultDeps) {
    const freeUsageCache = new FreeUsageCache(keyStore);
    this.agentVaultAccessService = new AgentVaultAccessService(licenseService, organizationsService, freeUsageCache);
    this.agentVaultUsageService = new AgentVaultUsageService(
      licenseService,
      usageMeteringService,
      organizationsService,
      freeUsageCache
    );
    this.accessBundlePermissionService = new AccessBundlePermissionService(
      projectPermissionService,
      actorGrantsService
    );
  }
}
