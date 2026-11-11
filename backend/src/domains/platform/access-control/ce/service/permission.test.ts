import { ForbiddenError } from "@casl/ability";

import { Permission, TPermissionRule } from "./permission";

type TSet = ["read" | "edit", "secrets" | "folders"];

const readProdSecrets: TPermissionRule<TSet>[] = [
  { action: "read", subject: "secrets", conditions: { environment: "prod" } }
];

describe("Permission.can", () => {
  test("should allow a check whose fields match the rule's conditions and refuse one that does not", () => {
    // Setup
    const permission = Permission.fromRules<TSet>({ rules: readProdSecrets });

    // Action
    const results = [
      permission.can({ action: "read", subject: "secrets", fields: { environment: "prod" } }),
      permission.can({ action: "read", subject: "secrets", fields: { environment: "dev" } })
    ];

    // Assert
    expect(results).toEqual([true, false]);
  });

  test("should leave the caller's fields object untouched", () => {
    // Setup
    const permission = Permission.fromRules<TSet>({ rules: readProdSecrets });
    const fields = { environment: "prod" };

    // Action
    permission.can({ action: "read", subject: "secrets", fields });

    // Assert
    expect(Object.keys(fields)).toEqual(["environment"]);
  });
});

describe("Permission.assert", () => {
  test("should throw CASL's ForbiddenError naming the action and subject the error handler reports", () => {
    // Setup
    const permission = Permission.fromRules<TSet>({ rules: readProdSecrets });

    // Action
    const check = () => permission.assert({ action: "edit", subject: "secrets", fields: { environment: "prod" } });

    // Assert
    expect(check).toThrow(ForbiddenError);
    try {
      check();
    } catch (error) {
      expect((error as ForbiddenError<never>).action).toBe("edit");
      expect((error as ForbiddenError<never>).subjectType).toBe("secrets");
    }
  });

  test("should pass when the check is allowed", () => {
    // Setup
    const permission = Permission.fromRules<TSet>({ rules: readProdSecrets });

    // Action
    const check = () => permission.assert({ action: "read", subject: "secrets", fields: { environment: "prod" } });

    // Assert
    expect(check).not.toThrow();
  });
});

describe("Permission.none", () => {
  test("should allow nothing", () => {
    // Setup
    const permission = Permission.none<TSet>();

    // Action
    const canRead = permission.can({ action: "read", subject: "folders" });

    // Assert
    expect(canRead).toBe(false);
  });
});
