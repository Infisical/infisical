import { packRules } from "@casl/ability/extra";

import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { Grant, Permission } from "@app/domains/platform/access-control/ce/module";
import {
  cryptographicOperatorPermissions,
  ProjectPermissionCmekActions,
  ProjectPermissionSet,
  ProjectPermissionSub,
  projectAdminPermissions,
  StandardProjectRoles
} from "@app/domains/platform/projects/ce/module";

import { kmsProjectRoles } from "./kms-project-roles";

const encrypt = { action: ProjectPermissionCmekActions.Encrypt, subject: ProjectPermissionSub.Cmek } as const;

const permissionOf = (roles: StandardProjectRoles, grant: Grant) =>
  Permission.fromRules<ProjectPermissionSet>({ rules: roles.rulesFor(grant) });

describe("kmsProjectRoles.rulesFor", () => {
  test("should let a cryptographic operator use keys but not manage them", () => {
    // Setup
    const grant = Grant.restore({ slug: ProjectMembershipRole.KmsCryptographicOperator });

    // Action
    const permission = permissionOf(kmsProjectRoles, grant);

    // Assert
    expect(permission.can(encrypt)).toBe(true);
    expect(permission.can({ action: ProjectPermissionCmekActions.Rotate, subject: ProjectPermissionSub.Cmek })).toBe(
      false
    );
  });

  test("should keep the generic project roles", () => {
    // Setup
    const grant = Grant.restore({ slug: ProjectMembershipRole.Admin });

    // Action
    const rules = kmsProjectRoles.rulesFor(grant);

    // Assert
    expect(rules).toBe(projectAdminPermissions);
    expect(kmsProjectRoles.projectType).toBe(ProjectType.KMS);
  });

  test("should apply a custom role as the customer wrote it", () => {
    // Setup
    const grant = Grant.restore({
      slug: ProjectMembershipRole.Custom,
      packedRules: packRules(cryptographicOperatorPermissions)
    });

    // Action
    const permission = permissionOf(kmsProjectRoles, grant);

    // Assert
    expect(permission.can(encrypt)).toBe(true);
  });
});
