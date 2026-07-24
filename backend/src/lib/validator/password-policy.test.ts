import { describe, expect, test } from "vitest";

import {
  doesPasswordMeetRequirement,
  PASSWORD_POLICY,
  PasswordPolicyConfigSchema,
  PasswordPolicySchema
} from "./password-policy";

describe("PasswordPolicySchema", () => {
  const validPassword = ["Horse", "Battery", 7].join("-");

  test("accepts a strong password", () => {
    expect(PasswordPolicySchema.safeParse(validPassword).success).toBe(true);
  });

  test.each([
    "Short-7",
    validPassword.slice(0, -2),
    "a".repeat(101),
    "12345678901234!",
    "abcdefghijklmn",
    "Password!!!!7",
    "Strong😀😀😀😀7",
    "Password\\escape7"
  ])("rejects a password outside the policy: %s", (password) => {
    expect(PasswordPolicySchema.safeParse(password).success).toBe(false);
  });

  test.each(["plan.organize7Beta", "user7@example.com", "https://example.com/Secure7", "123-45-6789Strong"])(
    "allows a strong password regardless of email-, URL-, or identifier-like content: %s",
    (password) => {
      expect(PasswordPolicySchema.safeParse(password).success).toBe(true);
    }
  );

  test("does not trim passwords", () => {
    const password = ` ${validPassword} `;
    const result = PasswordPolicySchema.parse(password);

    expect(result).toBe(password);
  });

  test("allows up to three repeated Unicode characters", () => {
    expect(PasswordPolicySchema.safeParse("StrongPassword😀😀😀7").success).toBe(true);
  });

  test("counts astral Unicode characters as single password characters", () => {
    const fewerThanFourteenCodePoints = "😀😃😄😁😆😅1a";
    const fewerThanOneHundredCodePoints = `${"😀😃".repeat(24)}😀Aa7`;

    expect(Array.from(fewerThanFourteenCodePoints)).toHaveLength(8);
    expect(fewerThanFourteenCodePoints).toHaveLength(14);
    expect(PasswordPolicySchema.safeParse(fewerThanFourteenCodePoints).success).toBe(false);

    expect(Array.from(fewerThanOneHundredCodePoints)).toHaveLength(52);
    expect(fewerThanOneHundredCodePoints.length).toBeGreaterThan(100);
    expect(PasswordPolicySchema.safeParse(fewerThanOneHundredCodePoints).success).toBe(true);
  });

  test("exports Unicode-aware length requirements", () => {
    expect(PASSWORD_POLICY.requirements[0].flags).toBe("u");
    expect(PASSWORD_POLICY.requirements[1].flags).toBe("u");
  });

  test("preserves the public validation error copy", () => {
    const result = PasswordPolicySchema.safeParse("Short-7");

    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected password validation to fail");
    expect(result.error.issues[0]?.message).toBe("Password must contain at least 14 characters");
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
