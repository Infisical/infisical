import { describe, expect, it } from "vitest";

import { loadRegistry } from "../src/registry.js";
import { capSelection, matchGlob, selectGuides } from "../src/select.js";

describe("glob matching", () => {
  it("matches ** across path separators", () => {
    expect(matchGlob("frontend/src/pages/**", "frontend/src/pages/a/b/c.tsx")).toBe(true);
    expect(matchGlob("frontend/src/pages/**", "frontend/src/hooks/a.tsx")).toBe(false);
  });

  it("matches **/ as an optional intermediate path", () => {
    expect(matchGlob("backend/**/secret-folder/**", "backend/src/services/secret-folder/x.ts")).toBe(
      true
    );
  });

  it("keeps a single star inside one segment", () => {
    expect(matchGlob("frontend/src/*.ts", "frontend/src/app.ts")).toBe(true);
    expect(matchGlob("frontend/src/*.ts", "frontend/src/nested/app.ts")).toBe(false);
  });

  it("does not treat a dot as a wildcard", () => {
    expect(matchGlob("a/b.ts", "a/bXts")).toBe(false);
  });
});

describe("registry", () => {
  it("loads and validates every registry file", () => {
    const entries = loadRegistry();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.guide.startsWith("docs/")).toBe(true);
      expect(entry.watch.length).toBeGreaterThan(0);
      expect(entry.fixture.length).toBeGreaterThan(0);
    }
  });

  it("starts with every guide non-critical so a flaky check cannot fail a PR", () => {
    // Guides earn `critical: true` once they have a track record; nothing should ship with
    // it set, because a red X from a non-deterministic check destroys adoption.
    expect(loadRegistry().every((entry) => entry.critical === false)).toBe(true);
  });
});

describe("guide selection", () => {
  it("selects a guide edited directly", () => {
    const selections = selectGuides(["docs/documentation/platform/folder.mdx"]);
    expect(selections.map((s) => s.entry.guide)).toContain(
      "docs/documentation/platform/folder.mdx"
    );
  });

  it("selects a guide via a watched frontend path", () => {
    const selections = selectGuides([
      "frontend/src/pages/secret-manager/SecretDashboardPage/components/ActionBar/ActionBar.tsx"
    ]);
    expect(selections.map((s) => s.entry.guide)).toContain(
      "docs/documentation/platform/folder.mdx"
    );
  });

  it("selects nothing for an unrelated change", () => {
    expect(selectGuides(["backend/src/db/migrations/20240101_x.ts"])).toEqual([]);
  });

  it("explains why each guide was selected", () => {
    const [selection] = selectGuides(["docs/documentation/platform/folder.mdx"]);
    expect(selection?.reasons.join(" ")).toContain("edited directly");
  });

  it("caps a selection and reports what it dropped rather than truncating silently", () => {
    const all = loadRegistry().map((entry) => ({ entry, reasons: ["test"] }));
    const { selected, dropped } = capSelection(all, 2);
    expect(selected).toHaveLength(2);
    expect(dropped).toHaveLength(all.length - 2);
    expect(selected.length + dropped.length).toBe(all.length);
  });
});
