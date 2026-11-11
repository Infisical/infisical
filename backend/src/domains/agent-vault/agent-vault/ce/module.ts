import { ProjectType } from "@app/db/schemas";
import { Meter, TLicenseRegistry } from "@app/domains/platform/license/ce/module";
import { TProjectsDomain } from "@app/domains/platform/projects/ce/module";

export * from "./service/agent-vault-roles";

export type TAgentVaultDeps = {
  projectsDomain: TProjectsDomain;
  licenseRegistry: TLicenseRegistry;
};

// Holds only its usage counter for now; it grows as Agent Vault moves into a domain.
export class AgentVaultModule {
  readonly name = "agent-vault";

  constructor({ projectsDomain, licenseRegistry }: TAgentVaultDeps) {
    licenseRegistry.registerUsageCounter({
      meter: Meter.AgentVaultIdentities,
      count: (orgId) => projectsDomain.countProjectIdentities(ProjectType.AgentVault, orgId ?? undefined)
    });
  }
}
