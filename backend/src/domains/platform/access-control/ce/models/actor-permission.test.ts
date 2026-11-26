import { PermissionDeniedError } from "@app/domains/lib/errors";

import { ActorPermission } from "./actor-permission";
import { Permission, TPermissionRule } from "./permission";

type TSet = ["read" | "edit" | "delete" | "assign-role", "secrets" | "identity" | "member"];

const memberRules: TPermissionRule<TSet>[] = [
  { action: "read", subject: "secrets" },
  { action: "read", subject: "identity" },
  { action: "delete", subject: "identity" },
  { action: "delete", subject: "member" }
];

const adminRules: TPermissionRule<TSet>[] = [
  ...memberRules,
  { action: "edit", subject: "secrets" },
  { action: "edit", subject: "identity" },
  { action: "assign-role", subject: "identity" },
  { action: "assign-role", subject: "member" }
];

// Target permissions.
const admin = Permission.fromRules<TSet>({ rules: adminRules });
const member = Permission.fromRules<TSet>({ rules: memberRules });

// The actor making the change.
const actorWith = (rules: TPermissionRule<TSet>[], usesNewPrivilegeSystem: boolean) =>
  ActorPermission.of<TSet>({ rules, usesNewPrivilegeSystem });
const legacy = { admin: actorWith(adminRules, false), member: actorWith(memberRules, false) };
const current = {
  admin: actorWith(adminRules, true),
  member: actorWith(memberRules, true),
  nobody: actorWith([], true)
};

const removeIdentity = (targets: { permission: Permission<TSet>; roleSlug?: string }[]) => ({
  actions: "delete" as const,
  subject: "identity" as const,
  targets
});

describe("ActorPermission.boundsViolations under the old privilege system", () => {
  test("should allow an admin to change a member's roles", () => {
    // Setup
    const check = removeIdentity([{ permission: member }]);

    // Action
    const missing = legacy.admin.boundsViolations(check);

    // Assert
    expect(missing).toEqual([]);
  });

  test("should report what a member lacks when the target is an admin", () => {
    // Setup
    const check = removeIdentity([{ permission: admin }]);

    // Action
    const missing = legacy.member.boundsViolations(check);

    // Assert
    expect(missing.length).toBeGreaterThan(0);
  });

  test("should measure every role of a multi-role target, not just the first", () => {
    // Setup
    const memberOnly = removeIdentity([{ permission: member }]);
    const memberAndAdmin = removeIdentity([{ permission: member }, { permission: admin }]);

    // Action
    const results = [legacy.member.boundsViolations(memberOnly), legacy.member.boundsViolations(memberAndAdmin)];

    // Assert
    expect(results[0]).toEqual([]);
    expect(results[1].length).toBeGreaterThan(0);
  });

  test("should run no comparison for an empty target set", () => {
    // Setup
    const check = removeIdentity([]);

    // Action
    const missing = legacy.member.boundsViolations(check);

    // Assert
    expect(missing).toEqual([]);
  });
});

describe("ActorPermission.boundsViolations under the new privilege system", () => {
  test("should let the actor's own grant of the action decide, whatever the target holds", () => {
    // Setup
    const check = removeIdentity([{ permission: admin }]);

    // Action
    const results = [current.member.boundsViolations(check), current.nobody.boundsViolations(check)];

    // Assert
    expect(results[0]).toEqual([]);
    expect(results[1]).toEqual([{ action: "delete", subject: "identity" }]);
  });

  test("should still require the action when the target set is empty", () => {
    // Setup
    const check = removeIdentity([]);

    // Action
    const results = [current.member.boundsViolations(check), current.nobody.boundsViolations(check)];

    // Assert
    expect(results[0]).toEqual([]);
    expect(results[1]).toEqual([{ action: "delete", subject: "identity" }]);
  });

  test("should accept any of several actions and report the first when none is held", () => {
    // Setup
    const check = {
      actions: ["assign-role" as const, "edit" as const],
      subject: "member" as const,
      targets: [{ permission: member }]
    };

    // Action
    const results = [current.admin.boundsViolations(check), current.member.boundsViolations(check)];

    // Assert
    expect(results[0]).toEqual([]);
    expect(results[1]).toEqual([{ action: "assign-role", subject: "member" }]);
  });

  describe("for an actor whose rule is scoped with an assignableRole condition", () => {
    const scopedActor = (condition: Record<string, unknown>) =>
      actorWith([{ action: "assign-role", subject: "identity", conditions: { assignableRole: condition } }], true);

    const assignRole = (actor: ActorPermission<TSet>, targets: { permission: Permission<TSet>; roleSlug?: string }[]) =>
      actor.boundsViolations({
        actions: "assign-role",
        subject: "identity",
        fields: { identityId: "identity-1" },
        targets
      });

    test("should allow a target holding a role the condition covers", () => {
      // Setup
      const actor = scopedActor({ $in: ["viewer", "member"] });

      // Action
      const missing = assignRole(actor, [{ permission: member, roleSlug: "member" }]);

      // Assert
      expect(missing).toEqual([]);
    });

    test("should refuse a target holding a role the condition excludes", () => {
      // Setup
      const actor = scopedActor({ $in: ["viewer", "member"] });

      // Action
      const missing = assignRole(actor, [{ permission: admin, roleSlug: "admin" }]);

      // Assert
      expect(missing).toEqual([{ action: "assign-role", subject: "identity" }]);
    });

    test("should match a $glob condition against the target role instead of throwing", () => {
      // Setup
      const actor = scopedActor({ $glob: "team-*" });

      // Action
      const results = [
        assignRole(actor, [{ permission: member, roleSlug: "team-a" }]),
        assignRole(actor, [{ permission: member, roleSlug: "admin" }])
      ];

      // Assert
      expect(results[0]).toEqual([]);
      expect(results[1].length).toBeGreaterThan(0);
    });
  });

  describe("for a delete rule scoped to the resource's own identity", () => {
    const scopedDeleter = (conditions: Record<string, unknown>) =>
      actorWith([{ action: "delete", subject: "member", conditions }], true);

    const removeMember = (actor: ActorPermission<TSet>, userEmail: string | undefined) =>
      actor.boundsViolations({
        actions: "delete",
        subject: "member",
        fields: { userEmail },
        targets: [{ permission: member, roleSlug: "member" }]
      });

    test.each([{ $eq: "contractor@acme.com" }, { $in: ["contractor@acme.com"] }, { $glob: "*@acme.com" }])(
      "should allow removing a member the condition covers (%j)",
      (condition) => {
        // Setup
        const actor = scopedDeleter({ userEmail: condition });

        // Action
        const missing = removeMember(actor, "contractor@acme.com");

        // Assert
        expect(missing).toEqual([]);
      }
    );

    test.each([{ $eq: "contractor@acme.com" }, { $in: ["contractor@acme.com"] }, { $glob: "*@acme.com" }])(
      "should refuse removing a member the condition excludes (%j)",
      (condition) => {
        // Setup
        const actor = scopedDeleter({ userEmail: condition });

        // Action
        const missing = removeMember(actor, "staff@other.com");

        // Assert
        expect(missing).toEqual([{ action: "delete", subject: "member" }]);
      }
    );

    test("should deny a target with no email rather than throwing", () => {
      // Setup
      const actor = scopedDeleter({ userEmail: { $glob: "*@acme.com" } });

      // Action
      const missing = removeMember(actor, undefined);

      // Assert
      expect(missing).toEqual([{ action: "delete", subject: "member" }]);
    });
  });
});

describe("ActorPermission.assertBounds", () => {
  const MESSAGE = "Failed to remove a more privileged identity";

  const refusalOf = (run: () => void) => {
    try {
      run();
    } catch (error) {
      return error as PermissionDeniedError;
    }
    throw new Error("expected the assertion to throw");
  };

  test("should not throw when the actor may make the change", () => {
    // Setup
    const run = () => {
      legacy.admin.assertBounds({ ...removeIdentity([{ permission: member }]), message: MESSAGE });
      current.member.assertBounds({ ...removeIdentity([{ permission: admin }]), message: MESSAGE });
    };

    // Action and assert
    expect(run).not.toThrow();
  });

  test("should refuse with the privilege level message and the missing permissions under the old system", () => {
    // Action
    const error = refusalOf(() =>
      legacy.member.assertBounds({ ...removeIdentity([{ permission: admin }]), message: MESSAGE })
    );

    // Assert
    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect([error.name, error.isBoundaryRefusal]).toEqual(["PermissionBoundaryError", true]);
    expect(error.message).toBe(`${MESSAGE}. Actor privilege level is not high enough to perform this action`);
    expect(error.details).toEqual({ missingPermissions: expect.any(Array) as unknown });
  });

  test("should refuse naming the first action and the subject under the new system", () => {
    // Action
    const error = refusalOf(() =>
      current.nobody.assertBounds({
        actions: ["delete", "read"],
        subject: "identity",
        targets: [{ permission: member }],
        message: MESSAGE
      })
    );

    // Assert
    expect(error.message).toBe(
      `${MESSAGE}. Permission denied: delete on identity. Check that the actor's role grants this permission and that all permission conditions are met.`
    );
    expect(error.details).toEqual({ missingPermissions: [{ action: "delete", subject: "identity" }] });
  });
});
