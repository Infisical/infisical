import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.resolve(__dirname, file), "utf8");

const fields = [
  "input.tsx",
  "textarea.tsx",
  "input-group.tsx",
  "select.tsx",
  "combobox.tsx",
  "multi-select.tsx"
];
const oldRecipe =
  /ring-3|ring-\[3px\]|ring-ring\/50|focus-visible:border-ring|control-invalid-ring/;

describe("field focus", () => {
  it.each(fields)("%s draws its box with the shared field recipe, not the old 3px halo", (file) => {
    const source = read(file);
    expect(source).not.toMatch(oldRecipe);
    expect(source).toMatch(/(?:controlStyles|styles)\.field\b/);
  });

  it("command search and buttons carry no field halo either", () => {
    expect(read("command.tsx")).not.toMatch(oldRecipe);
    expect(read("button.tsx")).not.toMatch(oldRecipe);
    expect(read("tabs.tsx")).not.toMatch(oldRecipe);
  });

  it("focus and invalid states come from the focus-ring tokens", () => {
    const css = read("controls.module.css");
    expect(css).toContain("0 0 0 var(--v4-size-focus-ring) var(--v4-focus-ring)");
    expect(css).toContain("0 0 0 var(--v4-size-focus-ring) var(--v4-focus-ring-bad)");
    const invalidAtRest = css.match(
      /\.field:is\(\[aria-invalid="true"\], \[data-invalid\]\),[^{]*\{([^}]*)\}/
    );
    expect(invalidAtRest?.[1]).toBeDefined();
    expect(invalidAtRest?.[1]).not.toContain("box-shadow");
  });

  it("every radius token is a whole pixel", () => {
    const tokens: { radius: { tokens: { name: string; value: string }[] } } = JSON.parse(
      read("../tokens.json")
    );
    tokens.radius.tokens.forEach((token) => {
      expect(token.value, token.name).toMatch(/^\d+px$/);
    });
  });
});
