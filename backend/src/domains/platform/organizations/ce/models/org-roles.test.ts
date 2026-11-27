import { packRules, unpackRules } from "@casl/ability/extra";

import { OrgMembershipRole } from "@app/db/schemas";
import { EntityNotFoundError } from "@app/domains/lib/errors";
import { Grant, Permission } from "@app/domains/platform/access-control/ce/module";

import { OrgRoles } from "./org-roles";
import {
  orgAdminPermissions,
  orgMemberPermissions,
  orgNoAccessPermissions,
  OrgPermissionAuditLogsActions,
  OrgPermissionMemberActions,
  OrgPermissionSchema,
  OrgPermissionSubjects
} from "./permissions/org-permission-set";

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

describe("OrgPermissionSubjects.AuditLogStreams", () => {
  test("should let the admin manage audit log streams, let a member read them, and be written by the role API", () => {
    // Setup
    const permissionOf = (slug: OrgMembershipRole) =>
      Permission.fromRules({ rules: OrgRoles.rulesFor(Grant.restore({ slug })) });
    const check = (action: OrgPermissionAuditLogsActions) => ({
      action,
      subject: OrgPermissionSubjects.AuditLogStreams
    });

    // Action
    const granted = [OrgMembershipRole.Admin, OrgMembershipRole.Member].map((slug) => [
      permissionOf(slug).can(check(OrgPermissionAuditLogsActions.Read)),
      permissionOf(slug).can(check(OrgPermissionAuditLogsActions.Edit))
    ]);

    // Assert
    expect(granted).toEqual([
      [true, true],
      [true, false]
    ]);
    expect(
      OrgPermissionSchema.safeParse({
        subject: OrgPermissionSubjects.AuditLogStreams,
        action: [OrgPermissionAuditLogsActions.Read, OrgPermissionAuditLogsActions.Edit]
      }).success
    ).toBe(true);
  });
});
