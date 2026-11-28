import { randomUUID } from "node:crypto";

import { RoleAssignment, TRoleAssignmentRecord } from "./role-assignment";

const assignment = (record: Partial<TRoleAssignmentRecord>) =>
  RoleAssignment.restore({
    id: randomUUID(),
    role: "member",
    customRoleId: null,
    isTemporary: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...record
  });

describe("RoleAssignment", () => {
  test("should be custom only under the custom slug", () => {
    // Setup
    const custom = assignment({ role: "custom", customRoleId: randomUUID(), customRoleSlug: "release-manager" });
    const builtIn = assignment({ role: "admin" });

    // Action
    const results = [custom.isCustom, builtIn.isCustom, custom.isBuiltIn("custom"), builtIn.isBuiltIn("admin")];

    // Assert
    expect(results).toEqual([true, false, false, true]);
  });

  test("should read a built-in slug as built in even when a custom role id is stored beside it, as its rules do", () => {
    // Setup
    const mismatched = assignment({ role: "admin", customRoleId: randomUUID() });

    // Action
    const results = [mismatched.isCustom, mismatched.isBuiltIn("admin"), mismatched.toGrant().isBuiltIn("admin")];

    // Assert
    expect(results).toEqual([false, true, true]);
  });

  test("should display a custom role by its name, then its slug, then as Custom, and a built-in role by its slug", () => {
    // Setup
    const id = randomUUID();
    const named = assignment({
      role: "custom",
      customRoleId: id,
      customRoleName: "Release",
      customRoleSlug: "release"
    });
    const slugOnly = assignment({ role: "custom", customRoleId: id, customRoleSlug: "release" });
    const unnamed = assignment({ role: "custom", customRoleId: id });
    const builtIn = assignment({ role: "viewer" });

    // Action
    const names = [named, slugOnly, unnamed, builtIn].map((role) => role.displayName);

    // Assert
    expect(names).toEqual(["Release", "release", "Custom", "viewer"]);
  });
});
