import { describe, expect, test } from "vitest";

import {
  doesPasswordMeetRequirement,
  PASSWORD_POLICY,
  PasswordPolicyConfigSchema,
  PasswordPolicySchema
} from "./password-policy";

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
    "Strong😀😀😀😀7",
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

  test("allows up to three repeated Unicode characters", () => {
    expect(PasswordPolicySchema.safeParse("Strong😀😀😀7").success).toBe(true);
  });

  test("preserves the public validation error copy", () => {
    const result = PasswordPolicySchema.safeParse("Short-7");

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected password validation to fail");
    expect(result.error.issues[0]?.message).toBe("Password must contain at least 10 characters");
  });

  test.each([validPassword, "Short-7", "密码安全-7", "Password!!!!7"])(
    "keeps the exported policy contract aligned with server validation: %s",
    (password) => {
      const meetsExportedPolicy = PASSWORD_POLICY.requirements.every((requirement) =>
        doesPasswordMeetRequirement(password, requirement)
      );

      expect(PasswordPolicySchema.safeParse(password).success).toBe(meetsExportedPolicy);
    }
  );

  test("exports a serializable policy contract", () => {
    const serializedPolicy: unknown = JSON.parse(JSON.stringify(PASSWORD_POLICY));

    expect(PasswordPolicyConfigSchema.parse(serializedPolicy)).toEqual(PASSWORD_POLICY);
  });
});
