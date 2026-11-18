import { packRules, unpackRules } from "@casl/ability/extra";

import { OrgMembershipRole } from "@app/db/schemas";
import { EntityNotFoundError } from "@app/domains/lib/errors";
import { Grant } from "@app/domains/platform/access-control/ce/module";

import {
  orgAdminPermissions,
  orgMemberPermissions,
  orgNoAccessPermissions,
  OrgPermissionMemberActions,
  OrgPermissionSubjects
} from "./org-permission-set";
import { OrgRoles } from "./org-roles";

describe("OrgRoles.rulesFor", () => {
  test.each([
    [OrgMembershipRole.Admin, orgAdminPermissions],
    [OrgMembershipRole.Member, orgMemberPermissions],
    [OrgMembershipRole.NoAccess, orgNoAccessPermissions]
  ])("should give the built-in %s role its defined rules", (slug, expected) => {
    // Setup
    const grant = Grant.restore({ slug });

    // Action
    const rules = OrgRoles.rulesFor(grant);

    // Assert
    expect(rules).toEqual(expected);
  });

  test("should give a custom role its own rules", () => {
    // Setup
    const own = [{ action: OrgPermissionMemberActions.Create, subject: OrgPermissionSubjects.Member }];
    const grant = Grant.restore({ slug: OrgMembershipRole.Custom, packedRules: packRules(own) });

    // Action
    const rules = OrgRoles.rulesFor(grant);

    // Assert
    expect(rules).toEqual(unpackRules(packRules(own)));
  });

  test("should refuse a slug that is neither built in nor custom", () => {
    // Setup
    const grant = Grant.restore({ slug: "ghost" });

    // Action
    const result = () => OrgRoles.rulesFor(grant);

    // Assert
    expect(result).toThrow(EntityNotFoundError);
    expect(result).toThrow("Organization role 'ghost' not found");
  });
});

describe("OrgRoles.isBuiltIn", () => {
  test("should know the built-in slugs and nothing else", () => {
    // Setup
    const slugs = [OrgMembershipRole.Admin, OrgMembershipRole.Member, OrgMembershipRole.NoAccess, "custom", "ghost"];

    // Action
    const builtIn = slugs.map((slug) => OrgRoles.isBuiltIn(slug));

    // Assert
    expect(builtIn).toEqual([true, true, true, false, false]);
  });
});
