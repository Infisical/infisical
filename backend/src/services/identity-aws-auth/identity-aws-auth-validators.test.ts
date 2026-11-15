import { describe, expect, test } from "vitest";

import {
  validateAccountIds,
  validateAccountIdsForUpdate,
  validatePrincipalArns,
  validatePrincipalArnsForUpdate
} from "./identity-aws-auth-validators";

describe("AWS allow list validators", () => {
  test("an omitted list stays undefined on update, so the stored value is kept", () => {
    expect(validateAccountIdsForUpdate.parse(undefined)).toBeUndefined();
    expect(validatePrincipalArnsForUpdate.parse(undefined)).toBeUndefined();
  });

  test("an omitted list defaults to empty on create", () => {
    expect(validateAccountIds.parse(undefined)).toBe("");
    expect(validatePrincipalArns.parse(undefined)).toBe("");
  });

  test("an explicit empty string is kept on update, so a list can be cleared", () => {
    expect(validateAccountIdsForUpdate.parse("")).toBe("");
    expect(validatePrincipalArnsForUpdate.parse("  ")).toBe("");
  });

  test("a list that only holds separators is rejected", () => {
    expect(validateAccountIds.safeParse(",").success).toBe(false);
    expect(validateAccountIdsForUpdate.safeParse(", ,").success).toBe(false);
    expect(validatePrincipalArns.safeParse(",").success).toBe(false);
    expect(validatePrincipalArnsForUpdate.safeParse(", ,").success).toBe(false);
  });
});
