import { ProjectType } from "@app/db/schemas";
import { Meter, TLicenseRegistry } from "@app/domains/platform/license/ce/module";
import { TOrganizationsProjectsDomain } from "@app/domains/platform/organizations-projects/ce/module";

export type TAgentVaultDeps = {
  organizationsProjectsDomain: TOrganizationsProjectsDomain;
  licenseRegistry: TLicenseRegistry;
};

// Holds only its usage counter for now; it grows as Agent Vault moves into a domain.
export class AgentVaultModule {
  readonly name = "agent-vault";

  constructor({ organizationsProjectsDomain, licenseRegistry }: TAgentVaultDeps) {
    licenseRegistry.registerUsageCounter({
      meter: Meter.AgentVaultIdentities,
      count: (orgId) => organizationsProjectsDomain.countProjectIdentities(ProjectType.AgentVault, orgId ?? undefined)
    });
  }
}
