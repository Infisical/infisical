import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { Meter, TLicenseRegistry } from "@app/domains/platform/license/ce/module";
import { TProductAccessRegistry, TProjectsDomain } from "@app/domains/platform/projects/ce/module";

import { agentVaultProjectAdminPermissions, agentVaultProjectMemberPermissions } from "./service/agent-vault-roles";

export * from "./service/agent-vault-roles";

export type TAgentVaultDeps = {
  projectsDomain: TProjectsDomain;
  productAccessRegistry: TProductAccessRegistry;
  licenseRegistry: TLicenseRegistry;
};

// Holds only its usage counter for now; it grows as Agent Vault moves into a domain.
export class AgentVaultModule {
  readonly name = "agent-vault";

  constructor({ projectsDomain, productAccessRegistry, licenseRegistry }: TAgentVaultDeps) {
    // Agent Vault issues only admin and member; a custom role means member, as in PAM.
    productAccessRegistry.registerDefaultRoles({
      projectType: ProjectType.AgentVault,
      roles: {
        [ProjectMembershipRole.Admin]: agentVaultProjectAdminPermissions,
        [ProjectMembershipRole.Member]: agentVaultProjectMemberPermissions
      }
    });
    productAccessRegistry.overrideCustomRoles({
      projectType: ProjectType.AgentVault,
      resolve: () => agentVaultProjectMemberPermissions
    });

    licenseRegistry.registerUsageCounter({
      meter: Meter.AgentVaultIdentities,
      count: (orgId) => projectsDomain.countProjectIdentities(ProjectType.AgentVault, orgId ?? undefined)
    });
  }
}
