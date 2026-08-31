import { createMongoAbility, MongoAbility } from "@casl/ability";

import { PermissionBoundaryError } from "@app/lib/errors";

import { projectAdminPermissions, projectMemberPermissions } from "./default-roles";
import { assertRoleSetBoundary } from "./permission-fns";
import { ProjectPermissionIdentityActions, ProjectPermissionSet, ProjectPermissionSub } from "./project-permission";

// Regression guard for the privilege-boundary fix on membership removal and role assignment.
// The bug this replaces was `const [first] = await getOrgPermissionByRoles(roles, orgId)`, which
// measured a multi-role target against only its first role -- so a principal holding
// [member, admin-ish-custom-role] was bounded as if it only held `member`.

const admin = createMongoAbility<MongoAbility<ProjectPermissionSet>>(projectAdminPermissions);
const member = createMongoAbility<MongoAbility<ProjectPermissionSet>>(projectMemberPermissions);

const runBoundary = (actorPermission: MongoAbility, targetPermissions: { permission: MongoAbility }[]) =>
  assertRoleSetBoundary({
    shouldUseNewPrivilegeSystem: false,
    opActions: ProjectPermissionIdentityActions.Delete,
    opSubject: ProjectPermissionSub.Identity,
    actorPermission,
    targetPermissions,
    baseMessage: "Failed to remove a more privileged identity from the project"
  });

describe("assertRoleSetBoundary", () => {
  test("an admin actor dominates a member target", () => {
    expect(() => runBoundary(admin, [{ permission: member }])).not.toThrow();
  });

  test("a member actor does not dominate an admin target", () => {
    expect(() => runBoundary(member, [{ permission: admin }])).toThrow(PermissionBoundaryError);
  });

  test("checks every role, not just the first", () => {
    // The regression: `member` alone passes, so a [member, admin] target must still be rejected.
    expect(() => runBoundary(member, [{ permission: member }])).not.toThrow();
    expect(() => runBoundary(member, [{ permission: member }, { permission: admin }])).toThrow(PermissionBoundaryError);
  });

  test("an empty target role set runs no comparison", () => {
    // This is how the NoAccess / expired-temporary-role exemption arrives: the slug list is
    // filtered before resolution, so the helper is handed nothing to compare against.
    expect(() => runBoundary(member, [])).not.toThrow();
  });

  test("the thrown error carries the missing permissions", () => {
    try {
      runBoundary(member, [{ permission: admin }]);
      expect.unreachable("expected a PermissionBoundaryError");
    } catch (err) {
      expect(err).toBeInstanceOf(PermissionBoundaryError);
      const { details } = err as PermissionBoundaryError & { details: { missingPermissions: unknown[] } };
      expect(details.missingPermissions.length).toBeGreaterThan(0);
    }
  });

  test("under the new privilege system the actor's own action grant decides", () => {
    const assertNewSystem = (actorPermission: MongoAbility) =>
      assertRoleSetBoundary({
        shouldUseNewPrivilegeSystem: true,
        opActions: ProjectPermissionIdentityActions.Delete,
        opSubject: ProjectPermissionSub.Identity,
        actorPermission,
        targetPermissions: [{ permission: admin }],
        baseMessage: "Failed to remove a more privileged identity from the project"
      });

    // Member holds identity:delete, so it passes despite being weaker than the target.
    expect(member.can(ProjectPermissionIdentityActions.Delete, ProjectPermissionSub.Identity)).toBe(true);
    expect(() => assertNewSystem(member)).not.toThrow();

    const noDelete = createMongoAbility<MongoAbility<ProjectPermissionSet>>([]);
    expect(() => assertNewSystem(noDelete)).toThrow(PermissionBoundaryError);
  });
});
