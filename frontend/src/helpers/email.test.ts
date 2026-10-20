import { describe, expect, it } from "vitest";

import { emailListSchema, isValidEmail, parseEmailList } from "./email";

describe("isValidEmail", () => {
  it.each(["a@example.com", "first.last+tag@sub.example.co"])("accepts %s", (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each([
    "",
    " ",
    "plainaddress",
    "a@example",
    "a@-bad.com",
    `a@${"x".repeat(64)}.com`,
    `${"a".repeat(250)}@example.com`
  ])("rejects %j", (email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});

describe("parseEmailList", () => {
  it("splits on commas, semicolons and whitespace, lowercases and dedupes in order", () => {
    expect(parseEmailList(["B@x.com, a@x.com;\nb@x.com\t c@x.com", "A@X.com", "  "])).toEqual([
      "b@x.com",
      "a@x.com",
      "c@x.com"
    ]);
  });
});

describe("emailListSchema", () => {
  it("requires an address only when asked", () => {
    expect(emailListSchema().safeParse([]).success).toBe(true);
    expect(emailListSchema({ isRequired: true }).safeParse([]).success).toBe(false);
  });

  it("enforces the cap and names invalid addresses", () => {
    expect(emailListSchema({ max: 1 }).safeParse(["a@x.com", "b@x.com"]).success).toBe(false);

    const result = emailListSchema().safeParse(["a@x.com", "nope"]);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Invalid email address: nope.");
  });
});
