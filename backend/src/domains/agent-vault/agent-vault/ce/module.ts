import { ProjectType } from "@app/db/schemas";
import { AgentVaultIdentities, TLicenseRegistry } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsDomain } from "@app/domains/platform/organizations-projects/ce/module";

export type TAgentVaultDeps = {
  organizationsProjects: TOrganizationsProjectsDomain;
  license: TLicenseRegistry;
};

// Holds only its usage counter for now; it grows as Agent Vault moves into a domain.
export class AgentVaultModule {
  readonly name = "agent-vault";

  constructor({ organizationsProjects, license }: TAgentVaultDeps) {
    license.registerUsageCounter({
      feature: AgentVaultIdentities,
      scope: "org",
      count: (orgId) => organizationsProjects.countProjectIdentities(ProjectType.AgentVault, orgId ?? undefined)
    });
  }
}
