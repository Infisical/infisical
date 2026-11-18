import { Permission, TPermissionRule } from "@app/domains/platform/access-control/ce/module";
import { PermissionBoundaryError } from "@app/lib/errors";

import { assertPermissionBounds } from "./permission-bounds";

type TSet = ["read" | "delete", "identity" | "secrets"];

const memberRules: TPermissionRule<TSet>[] = [
  { action: "read", subject: "identity" },
  { action: "delete", subject: "identity" }
];
const adminRules: TPermissionRule<TSet>[] = [...memberRules, { action: "read", subject: "secrets" }];

const member = Permission.fromRules<TSet>({ rules: memberRules });
const admin = Permission.fromRules<TSet>({ rules: adminRules });
const nobody = Permission.none<TSet>();

const MESSAGE = "Failed to remove a more privileged identity";

const capture = (run: () => void) => {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected the assertion to throw");
};

describe("assertPermissionBounds", () => {
  test("should not throw when the actor may make the change", () => {
    // Setup
    const targets = [{ permission: member }];

    // Action
    const run = () => {
      assertPermissionBounds(admin, {
        usesNewPrivilegeSystem: false,
        actions: "delete",
        subject: "identity",
        targets,
        message: MESSAGE
      });
      assertPermissionBounds(member, {
        usesNewPrivilegeSystem: true,
        actions: "delete",
        subject: "identity",
        targets: [{ permission: admin }],
        message: MESSAGE
      });
    };

    // Assert
    expect(run).not.toThrow();
  });

  test("should throw the privilege level message and the missing permissions under the old system", () => {
    // Setup
    const run = () =>
      assertPermissionBounds(member, {
        usesNewPrivilegeSystem: false,
        actions: "delete",
        subject: "identity",
        targets: [{ permission: admin }],
        message: MESSAGE
      });

    // Action
    const error = capture(run) as PermissionBoundaryError;

    // Assert
    expect(error).toBeInstanceOf(PermissionBoundaryError);
    expect(error.message).toBe(`${MESSAGE}. Actor privilege level is not high enough to perform this action`);
    expect(error.details).toEqual({ missingPermissions: [{ action: "read", subject: "secrets" }] });
  });

  test("should throw naming the first action and the subject under the new system", () => {
    // Setup
    const run = () =>
      assertPermissionBounds(nobody, {
        usesNewPrivilegeSystem: true,
        actions: ["delete", "read"],
        subject: "identity",
        targets: [{ permission: member }],
        message: MESSAGE
      });

    // Action
    const error = capture(run) as PermissionBoundaryError;

    // Assert
    expect(error).toBeInstanceOf(PermissionBoundaryError);
    expect(error.message).toBe(
      `${MESSAGE}. Permission denied: delete on identity. Check that the actor's role grants this permission and that all permission conditions are met.`
    );
    expect(error.details).toEqual({ missingPermissions: [{ action: "delete", subject: "identity" }] });
  });
});
