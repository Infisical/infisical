import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { Grant } from "@app/domains/platform/access-control/ce/module";
import { TProjectRoles, TProjectRule } from "@app/domains/platform/projects/ce/module";

import { pamProjectAdminPermissions, pamProjectMemberPermissions } from "./permissions/pam-roles";

// PAM project roles aren't the generic ones: what a member can do comes from folder/account memberships, resolved
// separately. So anything but the product admin gets the read-only member rules, Custom included (PAM only ever
// assigns `admin`/`member`, never custom roles or additional privileges).
export class PamProjectRoles implements TProjectRoles {
  readonly projectType = ProjectType.PAM;

  private readonly adminRules = pamProjectAdminPermissions;

  private readonly memberRules = pamProjectMemberPermissions;

  rulesFor(grant: Grant): TProjectRule[] {
    return grant.isBuiltIn(ProjectMembershipRole.Admin) ? this.adminRules : this.memberRules;
  }
}
