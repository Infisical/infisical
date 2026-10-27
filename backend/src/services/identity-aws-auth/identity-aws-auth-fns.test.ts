import { describe, expect, test } from "vitest";

import { hasAwsTrustBinding } from "./identity-aws-auth-fns";

describe("hasAwsTrustBinding", () => {
  test.each([
    { allowedAccountIds: null, allowedPrincipalArns: null },
    { allowedAccountIds: undefined, allowedPrincipalArns: undefined },
    { allowedAccountIds: "", allowedPrincipalArns: "" },
    { allowedAccountIds: "   ", allowedPrincipalArns: " " }
  ])("is false when both lists are unset: %o", (binding) => {
    expect(hasAwsTrustBinding(binding)).toBe(false);
  });

  test("is true when only the account list is set", () => {
    expect(hasAwsTrustBinding({ allowedAccountIds: "123456789012", allowedPrincipalArns: "" })).toBe(true);
  });

  test("is true when only the principal ARN list is set", () => {
    expect(
      hasAwsTrustBinding({ allowedAccountIds: "", allowedPrincipalArns: "arn:aws:iam::123456789012:role/app" })
    ).toBe(true);
  });
});
