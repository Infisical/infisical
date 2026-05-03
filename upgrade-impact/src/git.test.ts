import { describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(() => "A\tbackend/src/db/migrations/20260429000000_my migration.ts\nM\tREADME.md")
}));

describe("getAddedFiles", () => {
  it("preserves whitespace in tab-separated git paths", async () => {
    const { getAddedFiles } = await import("./git.js");

    expect(getAddedFiles("v1.2.2", "v1.2.3")).toEqual([
      "backend/src/db/migrations/20260429000000_my migration.ts"
    ]);
  });
});
