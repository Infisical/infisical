import { packRules, unpackRules } from "@casl/ability/extra";

import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { Grant } from "@app/domains/platform/access-control/ce/module";

import {
  ProjectPermissionActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "./project-permission-set";
import {
  projectAdminPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions,
  projectViewerPermission
} from "./project-roles";
import { StandardProjectRoles, TProjectRule } from "./standard-project-roles";

describe("StandardProjectRoles.rulesFor", () => {
  test.each([
    [ProjectMembershipRole.Admin, projectAdminPermissions],
    [ProjectMembershipRole.Member, projectMemberPermissions],
    [ProjectMembershipRole.Viewer, projectViewerPermission],
    [ProjectMembershipRole.NoAccess, projectNoAccessPermissions]
  ])("should give the generic %s role its defined rules", (slug, expected) => {
    // Setup
    const roles = StandardProjectRoles.generic(ProjectType.SecretManager);

    // Action
    const rules = roles.rulesFor(Grant.restore({ slug }));

    // Assert
    expect(rules).toEqual(expected);
  });

  test("should apply a custom role or privilege as the customer wrote it", () => {
    // Setup
    const roles = StandardProjectRoles.generic(ProjectType.SecretManager);
    const own: TProjectRule[] = [{ action: ProjectPermissionActions.Edit, subject: ProjectPermissionSub.Tags }];

    // Action
    const rules = roles.rulesFor(Grant.restore({ slug: ProjectMembershipRole.Custom, packedRules: packRules(own) }));

    // Assert
    expect(rules).toEqual(unpackRules(packRules(own)));
  });

  test("should grant nothing for a slug it does not define, such as a removed product's role", () => {
    // Setup
    const roles = StandardProjectRoles.generic(ProjectType.SecretManager);

    // Action
    const rules = roles.rulesFor(Grant.restore({ slug: "ssh-host-bootstrapper" }));

    // Assert
    expect(rules).toEqual([]);
  });

  test("should use the built-in roles it was given, for a product with its own", () => {
    // Setup
    const readOnly: TProjectRule[] = [
      { action: ProjectPermissionMemberActions.Read, subject: ProjectPermissionSub.Member }
    ];
    const roles = new StandardProjectRoles(ProjectType.KMS, { operator: readOnly });

    // Action
    const [operator, member] = ["operator", ProjectMembershipRole.Member].map((slug) =>
      roles.rulesFor(Grant.restore({ slug }))
    );

    // Assert
    expect(operator).toEqual(readOnly);
    expect(member).toEqual([]);
    expect(roles.projectType).toBe(ProjectType.KMS);
  });
});
