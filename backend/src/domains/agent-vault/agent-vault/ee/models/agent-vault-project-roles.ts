import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { Grant } from "@app/domains/platform/access-control/ce/module";
import { TProjectRoles, TProjectRule } from "@app/domains/platform/projects/ce/module";

import { agentVaultProjectAdminPermissions, agentVaultProjectMemberPermissions } from "./agent-vault-roles";

// Agent Vault issues only admin and member, as PAM does, so anything that is not the built-in admin, a custom role
// carrying the admin rules included, is a member.
export class AgentVaultProjectRoles implements TProjectRoles {
  readonly projectType = ProjectType.AgentVault;

  private readonly adminRules = agentVaultProjectAdminPermissions;

  private readonly memberRules = agentVaultProjectMemberPermissions;

  rulesFor(grant: Grant): TProjectRule[] {
    return grant.isBuiltIn(ProjectMembershipRole.Admin) ? this.adminRules : this.memberRules;
  }
}
