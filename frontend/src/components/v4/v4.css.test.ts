import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import tailwind from "@tailwindcss/postcss";
import postcss from "postcss";

describe("v4 stylesheet compilation", () => {
  it("generates semantic utilities from its separately imported stylesheet without global theme overrides", async () => {
    const stylesheet = path.resolve("src/components/v4/v4.css");
    const result = await postcss([tailwind()]).process(await readFile(stylesheet, "utf8"), {
      from: stylesheet
    });
    const rules = new Map<string, string>();
    const scopedRules = new Set<string>();
    result.root.walkRules((rule) => {
      rules.set(rule.selector, rule.toString());
      if (rule.parent?.type === "rule" && rule.parent.selector === ".v4") {
        scopedRules.add(rule.selector);
      }
    });
    [
      "bg-clip-border",
      "text-primary-foreground",
      "text-muted-foreground",
      "border-input",
      "bg-secondary",
      "text-secondary-foreground",
      "text-foreground",
      "text-destructive"
    ].forEach((utility) => {
      expect(scopedRules.has(`.${utility}`), utility).toBe(true);
    });
    expect(rules.get(".bg-clip-border")).toContain("background-clip: border-box");
    const scope = rules.get(".v4");
    expect(scope).toContain("--popover: var(--color-popover)");
    expect(scope).toContain("--foreground: var(--color-foreground)");
    expect(scope).toContain("--radius: var(--radius-lg)");
    expect(rules.has(":root, :host")).toBe(false);
    expect(rules.has('[data-theme="dark"] .v4')).toBe(false);
    expect(rules.get('.v4[data-theme="dark"]')).toContain("color-scheme: dark");
    expect(result.css).toContain("--v4-focus-ring:");
    expect(result.css).not.toContain("--v4-control-invalid-ring");
    expect(result.css).not.toContain(':where([data-theme="dark"], [data-theme="dark"] *)');
    expect(rules.get(".text-primary-foreground")).toContain("color: var(--primary-foreground)");
    expect(rules.get(".text-foreground")).toContain("color: var(--foreground)");
    expect(
      rules.get(".data-\\[state\\=selected\\]\\:bg-\\[color\\:var\\(--v4-selected-surface\\)\\]")
    ).toContain('data-state="selected"');
    expect(rules.get(".data-\\[orientation\\=vertical\\]\\:flex-col")).toContain(
      'data-orientation="vertical"'
    );
  });
});
