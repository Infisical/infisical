import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { Grant } from "@app/domains/platform/access-control/ce/module";
import { TProjectRoles, TProjectRule } from "@app/domains/platform/projects/ce/module";

import { pamProjectAdminPermissions, pamProjectMemberPermissions } from "./pam-roles";

// A PAM project's role slugs are the PAM product roles, and they mean something different from the generic project
// roles: everything a product member can do comes from their folder/account memberships, which PAM resolves
// separately. Anything that is not the product admin therefore resolves to the same read-only member ability,
// including Custom, which covers both custom roles and additional privileges, neither of which PAM issues (it only
// ever assigns `admin`/`member`).
export class PamProjectRoles implements TProjectRoles {
  readonly projectType = ProjectType.PAM;

  private readonly adminRules = pamProjectAdminPermissions;

  private readonly memberRules = pamProjectMemberPermissions;

  rulesFor(grant: Grant): TProjectRule[] {
    return grant.isBuiltIn(ProjectMembershipRole.Admin) ? this.adminRules : this.memberRules;
  }
}
