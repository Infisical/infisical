import { describe, expect, it } from "vitest";

import { projectSlugSchema, slugSchema } from "./schemas";

describe("projectSlugSchema", () => {
  it("accepts underscores between project slug words", () => {
    expect(projectSlugSchema().safeParse("repro_test_proj").success).toBe(true);
  });

  it.each(["_repro", "repro_", "repro__project", "repro_-project", "Repro_project"])(
    "rejects an invalid project slug: %s",
    (slug) => {
      expect(projectSlugSchema().safeParse(slug).success).toBe(false);
    }
  );

  it("does not change the generic slug format", () => {
    expect(slugSchema().safeParse("repro_test_proj").success).toBe(false);
  });
});
