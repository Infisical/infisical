import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import type { TAccessControlDomain } from "@app/domains/platform/access-control/ce/module";
import { Meter, TLicenseRegistry } from "@app/domains/platform/license/ce/module";
import { TProductAccessRegistry, TProjectsDomain } from "@app/domains/platform/projects/ce/module";

import { getAccessBundlePermission, TAccessBundlePermission } from "./service/access-bundle-permission";
import { agentVaultProjectAdminPermissions, agentVaultProjectMemberPermissions } from "./service/agent-vault-roles";

export type { TAccessBundlePermission } from "./service/access-bundle-permission";
export * from "./service/agent-vault-roles";

export type TAgentVaultDomain = {
  // What the actor may do in an Agent Vault project, and which access bundles it reaches.
  getAccessBundlePermission: (input: { actor: TActorContext; projectId: string }) => Promise<TAccessBundlePermission>;
};

export type TAgentVaultDeps = {
  projectsDomain: TProjectsDomain;
  accessControlDomain: TAccessControlDomain;
  productAccessRegistry: TProductAccessRegistry;
  licenseRegistry: TLicenseRegistry;
};

// Holds only its usage counter for now; it grows as Agent Vault moves into a domain.
export class AgentVaultModule {
  readonly name = "agent-vault";

  readonly service: TAgentVaultDomain;

  constructor({ projectsDomain, accessControlDomain, productAccessRegistry, licenseRegistry }: TAgentVaultDeps) {
    this.service = {
      getAccessBundlePermission: (input) => getAccessBundlePermission({ projectsDomain, accessControlDomain }, input)
    };

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
