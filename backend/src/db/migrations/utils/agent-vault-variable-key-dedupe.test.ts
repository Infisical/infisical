import { findVariableKeyRenames, TVariableKeyRow } from "./agent-vault-variable-key-dedupe";

const PROJECT = "project-a";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 1, 0, minute));

const row = (id: string, key: string, minute: number, projectId = PROJECT): TVariableKeyRow => ({
  id,
  key,
  projectId,
  createdAt: at(minute)
});

describe("findVariableKeyRenames", () => {
  test("distinct keys are left alone", () => {
    expect(findVariableKeyRenames([row("a", "GITHUB_TOKEN", 0), row("b", "SLACK_TOKEN", 1)]).size).toBe(0);
  });

  test("the oldest keeps a shared key and the rest are numbered in creation order", () => {
    const renames = findVariableKeyRenames([
      row("third", "API_KEY", 3),
      row("first", "API_KEY", 1),
      row("second", "API_KEY", 2)
    ]);

    expect(Object.fromEntries(renames)).toEqual({ second: "API_KEY_1", third: "API_KEY_2" });
  });

  test("a suffix another variable already holds is skipped, and that variable keeps it", () => {
    const renames = findVariableKeyRenames([
      row("first", "API_KEY", 1),
      row("second", "API_KEY", 2),
      row("holder", "API_KEY_1", 0)
    ]);

    expect(Object.fromEntries(renames)).toEqual({ second: "API_KEY_2" });
  });

  test("two renamed variables never land on the same key", () => {
    const renames = findVariableKeyRenames([
      row("a1", "A", 1),
      row("a2", "A", 2),
      row("a1dup", "A_1", 3),
      row("a1dup2", "A_1", 4)
    ]);

    const finalKeys = ["a1", "a2", "a1dup", "a1dup2"].map((id) => renames.get(id) ?? { a1: "A", a1dup: "A_1" }[id]);
    expect(new Set(finalKeys).size).toBe(4);
  });

  test("projects are deduplicated separately", () => {
    const renames = findVariableKeyRenames([row("a", "TOKEN", 1, "project-a"), row("b", "TOKEN", 2, "project-b")]);

    expect(renames.size).toBe(0);
  });

  test("a key at the length limit is shortened to fit its suffix", () => {
    const longKey = `K${"X".repeat(63)}`;
    const renames = findVariableKeyRenames([row("first", longKey, 1), row("second", longKey, 2)]);

    const renamed = renames.get("second")!;
    expect(renamed).toHaveLength(64);
    expect(renamed.endsWith("_1")).toBe(true);
    expect(renamed).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });

  test("a creation-time tie is broken by id, so the outcome never depends on row order", () => {
    const forward = findVariableKeyRenames([row("b", "TOKEN", 1), row("a", "TOKEN", 1)]);
    const reversed = findVariableKeyRenames([row("a", "TOKEN", 1), row("b", "TOKEN", 1)]);

    expect(Object.fromEntries(forward)).toEqual({ b: "TOKEN_1" });
    expect(Object.fromEntries(reversed)).toEqual({ b: "TOKEN_1" });
  });
});
