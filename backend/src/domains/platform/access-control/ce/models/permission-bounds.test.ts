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

const admin = Permission.fromRules<TSet>({ rules: adminRules });
const member = Permission.fromRules<TSet>({ rules: memberRules });
const nobody = Permission.none<TSet>();

const removeIdentity = (
  usesNewPrivilegeSystem: boolean,
  targets: { permission: Permission<TSet>; roleSlug?: string }[]
) => ({
  usesNewPrivilegeSystem,
  actions: "delete" as const,
  subject: "identity" as const,
  targets
});

describe("Permission.boundsViolations under the old privilege system", () => {
  test("should allow an admin to change a member's roles", () => {
    // Setup
    const check = removeIdentity(false, [{ permission: member }]);

    // Action
    const missing = admin.boundsViolations(check);

    // Assert
    expect(missing).toEqual([]);
  });

  test("should report what a member lacks when the target is an admin", () => {
    // Setup
    const check = removeIdentity(false, [{ permission: admin }]);

    // Action
    const missing = member.boundsViolations(check);

    // Assert
    expect(missing.length).toBeGreaterThan(0);
  });

  test("should measure every role of a multi-role target, not just the first", () => {
    // Setup
    const memberOnly = removeIdentity(false, [{ permission: member }]);
    const memberAndAdmin = removeIdentity(false, [{ permission: member }, { permission: admin }]);

    // Action
    const results = [member.boundsViolations(memberOnly), member.boundsViolations(memberAndAdmin)];

    // Assert
    expect(results[0]).toEqual([]);
    expect(results[1].length).toBeGreaterThan(0);
  });

  test("should run no comparison for an empty target set", () => {
    // Setup
    const check = removeIdentity(false, []);

    // Action
    const missing = member.boundsViolations(check);

    // Assert
    expect(missing).toEqual([]);
  });
});

describe("Permission.boundsViolations under the new privilege system", () => {
  test("should let the actor's own grant of the action decide, whatever the target holds", () => {
    // Setup
    const check = removeIdentity(true, [{ permission: admin }]);

    // Action
    const results = [member.boundsViolations(check), nobody.boundsViolations(check)];

    // Assert
    expect(results[0]).toEqual([]);
    expect(results[1]).toEqual([{ action: "delete", subject: "identity" }]);
  });

  test("should still require the action when the target set is empty", () => {
    // Setup
    const check = removeIdentity(true, []);

    // Action
    const results = [member.boundsViolations(check), nobody.boundsViolations(check)];

    // Assert
    expect(results[0]).toEqual([]);
    expect(results[1]).toEqual([{ action: "delete", subject: "identity" }]);
  });

  test("should accept any of several actions and report the first when none is held", () => {
    // Setup
    const check = {
      usesNewPrivilegeSystem: true,
      actions: ["assign-role" as const, "edit" as const],
      subject: "member" as const,
      targets: [{ permission: member }]
    };

    // Action
    const results = [admin.boundsViolations(check), member.boundsViolations(check)];

    // Assert
    expect(results[0]).toEqual([]);
    expect(results[1]).toEqual([{ action: "assign-role", subject: "member" }]);
  });

  describe("for an actor whose rule is scoped with an assignableRole condition", () => {
    const scopedActor = (condition: Record<string, unknown>) =>
      Permission.fromRules<TSet>({
        rules: [{ action: "assign-role", subject: "identity", conditions: { assignableRole: condition } }]
      });

    const assignRole = (actor: Permission<TSet>, targets: { permission: Permission<TSet>; roleSlug?: string }[]) =>
      actor.boundsViolations({
        usesNewPrivilegeSystem: true,
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
      Permission.fromRules<TSet>({ rules: [{ action: "delete", subject: "member", conditions }] });

    const removeMember = (actor: Permission<TSet>, userEmail: string | undefined) =>
      actor.boundsViolations({
        usesNewPrivilegeSystem: true,
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
