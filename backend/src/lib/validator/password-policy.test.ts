import { describe, expect, test } from "vitest";

import { BadRequestError } from "../errors";
import { PasswordPolicySchema, validatePasswordPolicy } from "./password-policy";

describe("PasswordPolicySchema", () => {
  const validPassword = ["Horse", 7, "Ba"].join("-");

  test("accepts a strong password", () => {
    expect(PasswordPolicySchema.safeParse(validPassword).success).toBe(true);
  });

  test.each([
    "Short-7",
    validPassword.slice(0, -1),
    "a".repeat(101),
    "12345678901234!",
    "abcdefghijklmn",
    "Password!!!!7",
    "Password\\escape7",
    "user@example.com-Password7",
    ["StrongPass123!", "https://example.com"].join("")
  ])("rejects a password outside the policy: %s", (password) => {
    expect(PasswordPolicySchema.safeParse(password).success).toBe(false);
  });

  test("does not trim passwords", () => {
    const password = ` ${validPassword} `;
    const result = PasswordPolicySchema.parse(password);

    expect(result).toBe(password);
  });

  test("throws a bad request error when service-level validation fails", () => {
    expect(() => validatePasswordPolicy("Short-7")).toThrow(BadRequestError);
  });
});
