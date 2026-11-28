import { describe, expect, it } from "vitest";

import {
  draftFromFragments,
  Fragment,
  isFragmentPath,
  parseFragment,
  ReleaseFragment
} from "./fragments.js";

const makeFragment = (file: string, overrides: Partial<Fragment> = {}): ReleaseFragment => ({
  file,
  fragment: {
    category: "breaking",
    impactLevel: "medium",
    title: `Change from ${file}`,
    description: "Something changed.",
    action: "Do something.",
    ...overrides
  },
  evidence: { type: "pr", ref: "#1", url: "https://github.com/Infisical/infisical/pull/1" }
});

describe("isFragmentPath", () => {
  it("accepts only kebab-case YAML files directly under the changes directory", () => {
    expect(isFragmentPath("upgrade-impact/changes/remove-legacy-env.yaml")).toBe(true);
    expect(isFragmentPath("upgrade-impact/changes/README.md")).toBe(false);
    expect(isFragmentPath("upgrade-impact/changes/Remove_Env.yaml")).toBe(false);
    expect(isFragmentPath("upgrade-impact/changes/nested/a.yaml")).toBe(false);
    expect(isFragmentPath("upgrade-impact/data/releases/v1.2.3.yaml")).toBe(false);
  });
});

describe("parseFragment", () => {
  const valid = "category: config\nimpactLevel: high\ntitle: T\ndescription: D\naction: A\n";

  it("parses a valid fragment", () => {
    expect(parseFragment(valid, "a.yaml")).toMatchObject({ category: "config", impactLevel: "high" });
  });

  it("rejects unknown fields, unknown categories and impact level none", () => {
    expect(() => parseFragment(`${valid}extra: 1\n`, "a.yaml")).toThrow(/a\.yaml is not a valid/);
    expect(() => parseFragment(valid.replace("config", "feature"), "a.yaml")).toThrow(/a\.yaml is not a valid/);
    expect(() => parseFragment(valid.replace("high", "none"), "a.yaml")).toThrow(/a\.yaml is not a valid/);
  });

  it("names the file when the YAML does not parse", () => {
    expect(() => parseFragment("title: [", "a.yaml")).toThrow(/a\.yaml contains invalid YAML/);
  });
});

describe("draftFromFragments", () => {
  it("reports no impact for a release with no fragments and no migrations", () => {
    const draft = draftFromFragments([], []);

    expect(draft.impactLevel).toBe("none");
    expect(draft.requiresDbMigration).toBe(false);
    expect(draft.dbSchemaChanges).toEqual([]);
  });

  it("lists migrations as low impact without a fragment", () => {
    const draft = draftFromFragments([], ["backend/src/db/migrations/2_b.ts", "backend/src/db/migrations/1_a.ts"]);

    expect(draft.impactLevel).toBe("low");
    expect(draft.requiresDbMigration).toBe(true);
    expect(draft.dbSchemaChanges).toHaveLength(1);
    expect(draft.dbSchemaChanges[0].evidence.map((evidence) => evidence.ref)).toEqual([
      "backend/src/db/migrations/1_a.ts",
      "backend/src/db/migrations/2_b.ts"
    ]);
  });

  it("routes fragments to their section and takes the highest impact level", () => {
    const draft = draftFromFragments(
      [
        makeFragment("upgrade-impact/changes/b.yaml", { category: "config", impactLevel: "low" }),
        makeFragment("upgrade-impact/changes/a.yaml", { category: "breaking", impactLevel: "high" }),
        makeFragment("upgrade-impact/changes/c.yaml", { category: "known-issue", impactLevel: "medium" })
      ],
      []
    );

    expect(draft.impactLevel).toBe("high");
    expect(draft.breakingChanges.map((entry) => entry.title)).toEqual(["Change from upgrade-impact/changes/a.yaml"]);
    expect(draft.configChanges).toHaveLength(1);
    expect(draft.knownIssues).toHaveLength(1);
    expect(draft.summary).toContain("1 breaking change, 1 configuration change, 1 known issue");
  });

  it("gives the same output whatever order the fragments arrive in", () => {
    const first = makeFragment("upgrade-impact/changes/a.yaml");
    const second = makeFragment("upgrade-impact/changes/b.yaml");

    expect(draftFromFragments([first, second], [])).toEqual(draftFromFragments([second, first], []));
  });
});
