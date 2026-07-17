import { describe, expect, test } from "vitest";

import { BadRequestError } from "../errors";
import { PasswordPolicySchema, validatePasswordPolicy } from "./password-policy";

describe("PasswordPolicySchema", () => {
  test("accepts a strong password", () => {
    expect(PasswordPolicySchema.safeParse("Correct-Horse-7-Battery").success).toBe(true);
  });

  test.each([
    "Short-7",
    "a".repeat(101),
    "12345678901234!",
    "abcdefghijklmn",
    "Password!!!!7",
    "Password\\escape7",
    "user@example.com-Password7"
  ])("rejects a password outside the policy: %s", (password) => {
    expect(PasswordPolicySchema.safeParse(password).success).toBe(false);
  });

  test("does not trim passwords", () => {
    const password = " Strong-Password-7 ";
    const result = PasswordPolicySchema.parse(password);

    expect(result).toBe(password);
  });

  test("throws a bad request error when service-level validation fails", () => {
    expect(() => validatePasswordPolicy("Short-7")).toThrow(BadRequestError);
  });
});
