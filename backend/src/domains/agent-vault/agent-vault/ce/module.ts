import { ProjectType } from "@app/db/schemas";
import { AgentVaultIdentities, TUsageCounter } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";

// Holds only its usage counter for now; it grows as Agent Vault moves into a domain.
export class AgentVaultModule {
  readonly name = "agent-vault";

  readonly usageCounters: TUsageCounter[];

  constructor({
    organizationsProjects
  }: {
    organizationsProjects: Pick<TOrganizationsProjectsService, "countProjectIdentities">;
  }) {
    this.usageCounters = [
      {
        feature: AgentVaultIdentities,
        scope: "org",
        count: (orgId) => organizationsProjects.countProjectIdentities(ProjectType.AgentVault, orgId ?? undefined)
      }
    ];
  }
}
