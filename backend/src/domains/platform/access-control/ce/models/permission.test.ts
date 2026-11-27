import { PermissionDeniedError } from "@app/domains/lib/errors";

import { Permission, TPermissionRule } from "./permission";
import { RuleSet } from "./rule-set";

type TSet = ["read" | "edit", "secrets" | "folders"];

const readProdSecrets: TPermissionRule<TSet>[] = [
  { action: "read", subject: "secrets", conditions: { environment: "prod" } }
];

const catchDenial = (check: () => void) => {
  try {
    check();
  } catch (error) {
    return error as PermissionDeniedError;
  }
  throw new Error("expected the check to throw");
};

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
    expect(Object.getOwnPropertySymbols(fields)).toEqual([]);
  });

  test("should build from a RuleSet", () => {
    // Setup
    const permission = Permission.fromRules<TSet>({ rules: RuleSet.of(readProdSecrets) });

    // Action
    const allowed = permission.can({ action: "read", subject: "secrets", fields: { environment: "prod" } });

    // Assert
    expect(allowed).toBe(true);
  });
});

describe("Permission.cannot", () => {
  test("should be the opposite of can", () => {
    // Setup
    const permission = Permission.fromRules<TSet>({ rules: readProdSecrets });

    // Action
    const results = [
      permission.cannot({ action: "read", subject: "secrets", fields: { environment: "prod" } }),
      permission.cannot({ action: "edit", subject: "secrets" })
    ];

    // Assert
    expect(results).toEqual([false, true]);
  });
});

describe("Permission.assert", () => {
  test("should throw PermissionDeniedError naming the refused check", () => {
    // Setup
    const permission = Permission.fromRules<TSet>({ rules: readProdSecrets });
    const fields = { environment: "prod" };

    // Action
    const error = catchDenial(() => permission.assert({ action: "edit", subject: "secrets", fields }));

    // Assert
    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect(error.message).toBe("You are not allowed to edit on secrets");
    expect(error.denial).toMatchObject({ action: "edit", subject: "secrets", subjectFields: fields, matchedRules: [] });
  });

  test("should report the rules that matched the refused action and subject", () => {
    // Setup
    const permission = Permission.fromRules<TSet>({ rules: readProdSecrets });

    // Action
    const error = catchDenial(() =>
      permission.assert({ action: "read", subject: "secrets", fields: { environment: "dev" } })
    );

    // Assert
    expect(error.denial?.matchedRules).toEqual([
      { action: "read", inverted: false, subject: "secrets", conditions: { environment: "prod" } }
    ]);
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

describe("Permission.rules", () => {
  test("should return the rules it was built from", () => {
    // Setup
    const permission = Permission.fromRules<TSet>({ rules: readProdSecrets });

    // Action
    const { rules } = permission;

    // Assert
    expect(rules).toMatchObject(readProdSecrets);
  });
});
