import { packRules } from "@casl/ability/extra";

import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { Grant } from "@app/domains/platform/access-control/ce/module";
import { projectAdminPermissions } from "@app/domains/platform/projects/ce/module";

import { PamProjectRoles } from "./pam-project-roles";
import { pamProjectMemberPermissions } from "./pam-roles";

describe("PamProjectRoles.rulesFor", () => {
  test("should give the product admin the full project admin rules", () => {
    // Setup
    const roles = new PamProjectRoles();

    // Action
    const rules = roles.rulesFor(Grant.restore({ slug: ProjectMembershipRole.Admin }));

    // Assert
    expect(rules).toBe(projectAdminPermissions);
    expect(roles.projectType).toBe(ProjectType.PAM);
  });

  test.each([ProjectMembershipRole.Member, ProjectMembershipRole.Viewer, "removed-product-role"])(
    "should read the slug %s as a member",
    (slug) => {
      // Setup
      const roles = new PamProjectRoles();

      // Action
      const rules = roles.rulesFor(Grant.restore({ slug }));

      // Assert
      expect(rules).toBe(pamProjectMemberPermissions);
    }
  );

  test("should read a custom role carrying the admin rules as a member", () => {
    // Setup
    const roles = new PamProjectRoles();
    const grant = Grant.restore({
      slug: ProjectMembershipRole.Custom,
      packedRules: packRules(projectAdminPermissions)
    });

    // Action
    const rules = roles.rulesFor(grant);

    // Assert
    expect(rules).toBe(pamProjectMemberPermissions);
  });
});
