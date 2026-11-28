import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { Grant } from "@app/domains/platform/access-control/ce/module";
import { TProjectRoles, TProjectRule } from "@app/domains/platform/projects/ce/module";

import { agentVaultProjectAdminPermissions, agentVaultProjectMemberPermissions } from "./permissions/agent-vault-roles";

// Agent Vault only issues admin and member (like PAM), so anything but the built-in admin is a member, even a
// custom role carrying the admin rules.
export class AgentVaultProjectRoles implements TProjectRoles {
  readonly projectType = ProjectType.AgentVault;

  private readonly adminRules = agentVaultProjectAdminPermissions;

  private readonly memberRules = agentVaultProjectMemberPermissions;

  rulesFor(grant: Grant): TProjectRule[] {
    return grant.isBuiltIn(ProjectMembershipRole.Admin) ? this.adminRules : this.memberRules;
  }
}
