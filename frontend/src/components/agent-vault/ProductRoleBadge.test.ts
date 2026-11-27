import { describe, expect, it } from "vitest";

import { sortRoleBadges } from "./ProductRoleBadge";

describe("sortRoleBadges", () => {
  it("puts Admin and No Access first, then the rest by name", () => {
    const sorted = sortRoleBadges([
      { slug: "release-engineers", name: "Release Engineers" },
      { slug: "no-access", name: "No Access" },
      { slug: "code-review-users", name: "code-review users" },
      { slug: "admin", name: "Admin" }
    ]);
    expect(sorted.map((role) => role.slug)).toEqual([
      "admin",
      "no-access",
      "code-review-users",
      "release-engineers"
    ]);
  });
});
