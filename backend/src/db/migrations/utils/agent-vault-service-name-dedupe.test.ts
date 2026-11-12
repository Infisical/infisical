import slugify from "@sindresorhus/slugify";
import { describe, expect, test } from "vitest";

import { findServiceNameRenames, TServiceNameRow } from "./agent-vault-service-name-dedupe";

let sequence = 0;
const row = (overrides: Partial<TServiceNameRow> = {}): TServiceNameRow => {
  sequence += 1;
  return {
    id: `00000000-0000-0000-0000-${String(sequence).padStart(12, "0")}`,
    projectId: "project-1",
    name: "github",
    type: "http",
    accessBundleName: "engineering",
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, sequence)),
    ...overrides
  };
};

const isSlug = (value: string) => slugify(value, { lowercase: true }) === value;

describe("findServiceNameRenames", () => {
  test("leaves unique names alone, in one project and across projects", () => {
    expect(
      findServiceNameRenames([
        row({ name: "github" }),
        row({ name: "linear" }),
        row({ name: "github", projectId: "project-2" })
      ]).size
    ).toBe(0);
  });

  test("a new name skips the names of live sessions' inline services in the project", () => {
    const older = row({ name: "db", accessBundleName: "a" });
    const newer = row({ name: "db", accessBundleName: "b" });
    const elsewhere = row({ name: "db", accessBundleName: "b", projectId: "project-2" });
    const later = row({ name: "db", accessBundleName: "b", projectId: "project-2" });
    const renames = findServiceNameRenames(
      [older, newer, elsewhere, later],
      new Map([["project-1", new Set(["db-b"])]])
    );
    expect(renames.get(newer.id)).toBe("db-b-1");
    expect(renames.get(later.id)).toBe("db-b");
  });

  test("the oldest keeps a shared name and later ones take their bundle's name", () => {
    const older = row({ accessBundleName: "engineering" });
    const newer = row({ accessBundleName: "sales" });
    const renames = findServiceNameRenames([newer, older]);
    expect([...renames]).toEqual([[newer.id, "github-sales"]]);
  });

  test("ties on createdAt break by id, so the result never depends on read order", () => {
    const createdAt = new Date(Date.UTC(2026, 9, 1));
    const first = row({ id: "00000000-0000-0000-0000-00000000000a", createdAt, accessBundleName: "a" });
    const second = row({ id: "00000000-0000-0000-0000-00000000000b", createdAt, accessBundleName: "b" });
    expect([...findServiceNameRenames([second, first])]).toEqual([[second.id, "github-b"]]);
    expect([...findServiceNameRenames([first, second])]).toEqual([[second.id, "github-b"]]);
  });

  test("never takes a name another service holds, and numbers past one that is taken", () => {
    const kept = row({ accessBundleName: "engineering" });
    const alreadyThere = row({ name: "github-sales", accessBundleName: "other" });
    const dupe = row({ accessBundleName: "sales" });
    const dupeAgain = row({ accessBundleName: "sales" });
    const renames = findServiceNameRenames([kept, alreadyThere, dupe, dupeAgain]);
    expect(renames.get(dupe.id)).toBe("github-sales-1");
    expect(renames.get(dupeAgain.id)).toBe("github-sales-2");
    expect(renames.has(kept.id)).toBe(false);
    expect(renames.has(alreadyThere.id)).toBe(false);
  });

  test("fits 64 characters, or 63 for a database or SSH service, and stays a slug", () => {
    const longName = `a${"-b".repeat(31)}c`.slice(0, 64);
    const longBundle = "x".repeat(64);
    const rows = [
      row({ name: longName }),
      row({ name: longName, accessBundleName: longBundle }),
      row({ name: "db", type: "postgres" }),
      row({ name: "db", type: "postgres", accessBundleName: longBundle }),
      row({ name: "db", type: "postgres", accessBundleName: longBundle })
    ];
    const renamed = [...findServiceNameRenames(rows).entries()];
    expect(renamed).toHaveLength(3);
    renamed.forEach(([id, name]) => {
      const max = rows.find((candidate) => candidate.id === id)!.type === "postgres" ? 63 : 64;
      expect(name.length).toBeLessThanOrEqual(max);
      expect(isSlug(name)).toBe(true);
    });
    expect(new Set(renamed.map(([, name]) => name)).size).toBe(3);
    expect(renamed[1][1].startsWith("d")).toBe(true);
  });
});
