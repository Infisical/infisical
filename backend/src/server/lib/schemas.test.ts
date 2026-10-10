import { describe, expect, test } from "vitest";

import { projectSlugSchema } from "./schemas";

describe("projectSlugSchema", () => {
  test.each(["repro-proj", "repro_test_proj", "a", "proj1", "a_b-c_d"])("accepts %s", (slug) => {
    expect(projectSlugSchema.safeParse(slug).success).toBe(true);
  });

  test.each(["", "_proj", "proj_", "-proj", "proj-", "proj__test", "Proj", "pro j", "pro.j", "a".repeat(65)])(
    "rejects %s",
    (slug) => {
      expect(projectSlugSchema.safeParse(slug).success).toBe(false);
    }
  );

  test("trims surrounding whitespace", () => {
    expect(projectSlugSchema.parse("  repro_test_proj  ")).toBe("repro_test_proj");
  });
});
