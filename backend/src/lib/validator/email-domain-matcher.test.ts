import {
  AllowedEmailDomainsSchema,
  matchesAllowedEmailDomain,
  normalizeAllowedEmailDomains
} from "./email-domain-matcher";

describe("allowed email domains", () => {
  test("normalizes prefixes, casing, whitespace, and duplicates", () => {
    expect(normalizeAllowedEmailDomains(" @Example.com, example.com,  TEAM.example.com ")).toBe(
      "example.com, team.example.com"
    );
  });

  test.each(["example", "https://example.com", "example..com", "-example.com", "@", ","])(
    "rejects an invalid domain: %s",
    (domain) => {
      expect(AllowedEmailDomainsSchema.safeParse(domain).success).toBe(false);
    }
  );

  test("accepts a blank allowance and valid comma-separated domains", () => {
    expect(AllowedEmailDomainsSchema.parse("")).toBe("");
    expect(AllowedEmailDomainsSchema.parse("@Example.com, team.example.com")).toBe("example.com, team.example.com");
  });

  test("matches domains case-insensitively and supports legacy @ prefixes", () => {
    expect(matchesAllowedEmailDomain("User@Example.com", "@example.com")).toBe(true);
  });

  test("does not match a parent domain unless it is explicitly allowed", () => {
    expect(matchesAllowedEmailDomain("user@team.example.com", "example.com")).toBe(false);
  });
});
