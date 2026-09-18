import { describe, expect, test } from "vitest";

import { getMigrationBootDirection } from "./auto-start-migrations-fns";

describe("getMigrationBootDirection", () => {
  test("returns 'current' when applied and bundled match exactly", () => {
    const result = getMigrationBootDirection({
      appliedMigrationNames: ["20260101000000_a.mjs", "20260102000000_b.mjs"],
      bundledMigrationNames: ["20260101000000_a.mjs", "20260102000000_b.mjs"]
    });
    expect(result.direction).toBe("current");
  });

  test("returns 'behind' when the image bundles migrations not yet applied", () => {
    const result = getMigrationBootDirection({
      appliedMigrationNames: ["20260101000000_a.mjs"],
      bundledMigrationNames: ["20260101000000_a.mjs", "20260102000000_b.mjs"]
    });
    expect(result.direction).toBe("behind");
    expect(result.pendingMigrationNames).toEqual(["20260102000000_b.mjs"]);
  });

  test("returns 'ahead' on a clean rolling deploy (DB has strictly-newer migrations, nothing pending)", () => {
    const result = getMigrationBootDirection({
      appliedMigrationNames: ["20260101000000_a.mjs", "20260102000000_b.mjs", "20260103000000_c.mjs"],
      bundledMigrationNames: ["20260101000000_a.mjs", "20260102000000_b.mjs"]
    });
    expect(result.direction).toBe("ahead");
    expect(result.unknownAppliedMigrationNames).toEqual(["20260103000000_c.mjs"]);
  });

  // INC-62: a backdated migration merged after later-timestamped ones (common on long-lived branches).
  // The DB has an unknown migration whose timestamp is OLDER than the image's newest bundled migration,
  // but the image has nothing pending. Its bundled set is still a strict subset of what's applied, so it
  // must boot ('ahead'), not fail ('invalid').
  test("returns 'ahead' for an interleaved/backdated unknown migration when nothing is pending", () => {
    const result = getMigrationBootDirection({
      appliedMigrationNames: [
        "20260101000000_a.mjs",
        "20260102000000_b.mjs",
        "20260102120000_backdated.mjs", // older than the image's newest bundled migration
        "20260103000000_c.mjs"
      ],
      bundledMigrationNames: ["20260101000000_a.mjs", "20260102000000_b.mjs", "20260103000000_c.mjs"]
    });
    expect(result.direction).toBe("ahead");
    expect(result.unknownAppliedMigrationNames).toEqual(["20260102120000_backdated.mjs"]);
    expect(result.pendingMigrationNames).toEqual([]);
  });

  test("returns 'invalid' only on a true fork (DB has unknown migrations AND the image has pending ones)", () => {
    const result = getMigrationBootDirection({
      appliedMigrationNames: ["20260101000000_a.mjs", "20260102000000_db_only.mjs"],
      bundledMigrationNames: ["20260101000000_a.mjs", "20260103000000_image_only.mjs"]
    });
    expect(result.direction).toBe("invalid");
    expect(result.unknownAppliedMigrationNames).toEqual(["20260102000000_db_only.mjs"]);
    expect(result.pendingMigrationNames).toEqual(["20260103000000_image_only.mjs"]);
  });
});
