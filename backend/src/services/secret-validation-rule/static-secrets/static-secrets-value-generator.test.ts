import RE2 from "re2";
import { describe, expect, test } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import { generateStaticSecretValue } from "./static-secrets-value-generator";

describe("generateStaticSecretValue", () => {
  test("wraps an unanchored regex match with the prefix and suffix and passes RE2 on the whole value", () => {
    const value = generateStaticSecretValue({
      regexPattern: "[A-Z]{16}",
      requiredPrefix: "pre_",
      requiredSuffix: "_end"
    });

    expect(value).toMatch(/^pre_[A-Z]{16}_end$/);
    expect(new RE2("[A-Z]{16}").test(value)).toBe(true);
  });

  test("respects the length window without a regex", () => {
    const value = generateStaticSecretValue({ minLength: 20, maxLength: 24, requiredPrefix: "a_" });

    expect(value.startsWith("a_")).toBe(true);
    expect(value.length).toBeGreaterThanOrEqual(20);
    expect(value.length).toBeLessThanOrEqual(24);
  });

  test.each([
    [
      "an anchored regex combined with a prefix and suffix",
      { regexPattern: "^[A-Z]{16}$", requiredPrefix: "pre_", requiredSuffix: "_end" }
    ],
    ["a leading inline flag", { regexPattern: "(?i)^[a-z]{16}$" }],
    ["a unicode brace escape RE2 reads differently", { regexPattern: "^\\u{41}$" }],
    ["a prefix and suffix longer than the maximum", { requiredPrefix: "pre_", requiredSuffix: "_end", maxLength: 4 }],
    ["a minimum above the maximum", { minLength: 30, maxLength: 20 }]
  ])("fails visibly for %s", (_, constraints) => {
    expect(() => generateStaticSecretValue(constraints)).toThrow(BadRequestError);
  });
});
