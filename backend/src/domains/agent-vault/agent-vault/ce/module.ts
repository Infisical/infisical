import { ProjectType } from "@app/db/schemas";
import { Meter, TUsageCounter } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";

export type TAgentVaultDeps = {
  organizationsProjectsService: TOrganizationsProjectsService;
};

// Holds only its usage counter for now; it grows as Agent Vault moves into a domain.
export class AgentVaultModule {
  readonly usageCounters: TUsageCounter[];

  constructor({ organizationsProjectsService }: TAgentVaultDeps) {
    this.usageCounters = [
      {
        meter: Meter.AgentVaultIdentities,
        count: (orgId) =>
          organizationsProjectsService.countProjectIdentities(ProjectType.AgentVault, orgId ?? undefined)
      }
    ];
  }
}
