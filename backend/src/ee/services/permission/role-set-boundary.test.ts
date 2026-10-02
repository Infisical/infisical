import { createMongoAbility, MongoAbility } from "@casl/ability";

import { conditionsMatcher } from "@app/lib/casl";
import { PermissionBoundaryError } from "@app/lib/errors";

import { projectAdminPermissions, projectMemberPermissions } from "./default-roles";
import { assertRoleSetBoundary } from "./permission-fns";
import {
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "./project-permission";

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

  test("an empty target role set still requires the action under the new privilege system", () => {
    // A no-access group resolves to zero roles, but the actor must still hold the action itself.
    const assertNewSystem = (actorPermission: MongoAbility) =>
      assertRoleSetBoundary({
        shouldUseNewPrivilegeSystem: true,
        opActions: ProjectPermissionIdentityActions.Delete,
        opSubject: ProjectPermissionSub.Identity,
        actorPermission,
        targetPermissions: [],
        baseMessage: "Failed to remove a more privileged identity from the project"
      });

    expect(() => assertNewSystem(member)).not.toThrow();
    expect(() => assertNewSystem(createMongoAbility<MongoAbility<ProjectPermissionSet>>([]))).toThrow(
      PermissionBoundaryError
    );
  });

  describe("an actor whose rule is scoped with an assignableRole condition", () => {
    const scopedActor = (condition: Record<string, unknown>) =>
      createMongoAbility<MongoAbility<ProjectPermissionSet>>(
        [
          {
            action: ProjectPermissionIdentityActions.AssignRole,
            subject: ProjectPermissionSub.Identity,
            conditions: { assignableRole: condition }
          }
        ],
        { conditionsMatcher }
      );

    const assignRole = (
      actorPermission: MongoAbility,
      targetPermissions: { permission: MongoAbility; role?: { slug: string } }[]
    ) =>
      assertRoleSetBoundary({
        shouldUseNewPrivilegeSystem: true,
        opActions: ProjectPermissionIdentityActions.AssignRole,
        opSubject: ProjectPermissionSub.Identity,
        actorPermission,
        targetPermissions,
        baseMessage: "Failed to change the roles of a more privileged identity",
        subjectFields: { identityId: "identity-1" }
      });

    test("passes for a target holding a role the condition covers", () => {
      const actor = scopedActor({ $in: ["viewer", "member"] });
      expect(() => assignRole(actor, [{ permission: member, role: { slug: "member" } }])).not.toThrow();
    });

    test("still rejects a target holding a role the condition excludes", () => {
      const actor = scopedActor({ $in: ["viewer", "member"] });
      expect(() => assignRole(actor, [{ permission: admin, role: { slug: "admin" } }])).toThrow(
        PermissionBoundaryError
      );
    });

    test("a $glob condition matches the target role instead of throwing", () => {
      // Evaluating $glob against an absent assignableRole threw a raw TypeError out of picomatch,
      // which surfaced as a 500 rather than a permission error.
      const actor = scopedActor({ $glob: "team-*" });
      expect(() => assignRole(actor, [{ permission: member, role: { slug: "team-a" } }])).not.toThrow();
      expect(() => assignRole(actor, [{ permission: member, role: { slug: "admin" } }])).toThrow(
        PermissionBoundaryError
      );
    });
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

  // The removal guards bound `delete` while passing only `assignableRole`, so a rule scoped to the
  // resource's own identity (userEmail / groupName / identityId) was evaluated against an absent
  // field: $eq and $in denied a removal the actor was entitled to, and $glob threw a raw TypeError
  // out of picomatch as a 500. Every guard now passes the resource field it scopes on.
  describe("a delete rule scoped to the resource's own identity", () => {
    const scopedDeleter = (conditions: Record<string, unknown>) =>
      createMongoAbility<MongoAbility<ProjectPermissionSet>>(
        [
          {
            action: ProjectPermissionMemberActions.Delete,
            subject: ProjectPermissionSub.Member,
            conditions
          }
        ] as never,
        { conditionsMatcher }
      );

    const removeMember = (actorPermission: MongoAbility, userEmail: string | undefined) =>
      assertRoleSetBoundary({
        shouldUseNewPrivilegeSystem: true,
        opActions: ProjectPermissionMemberActions.Delete,
        opSubject: ProjectPermissionSub.Member,
        actorPermission,
        targetPermissions: [{ permission: member, role: { slug: "member" } }],
        baseMessage: "Failed to remove a more privileged member from the project",
        subjectFields: { userEmail }
      });

    test.each([{ $eq: "contractor@acme.com" }, { $in: ["contractor@acme.com"] }, { $glob: "*@acme.com" }])(
      "permits removing a member the condition covers (%j)",
      (condition) => {
        expect(() => removeMember(scopedDeleter({ userEmail: condition }), "contractor@acme.com")).not.toThrow();
      }
    );

    test.each([{ $eq: "contractor@acme.com" }, { $in: ["contractor@acme.com"] }, { $glob: "*@acme.com" }])(
      "still rejects removing a member the condition excludes (%j)",
      (condition) => {
        expect(() => removeMember(scopedDeleter({ userEmail: condition }), "staff@other.com")).toThrow(
          PermissionBoundaryError
        );
      }
    );

    test("a target with no email is denied rather than throwing a TypeError", () => {
      // Users.email is nullable, so the guard passes undefined. picomatch rejects a non-string
      // input, which reached the client as a 500 instead of a permission error.
      expect(() => removeMember(scopedDeleter({ userEmail: { $glob: "*@acme.com" } }), undefined)).toThrow(
        PermissionBoundaryError
      );
    });
  });
});
