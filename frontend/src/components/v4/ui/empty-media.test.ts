import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.join(import.meta.dirname, file), "utf8");
const css = read("empty.module.css");
const tokens = new Map(
  [...read("../tokens.json").matchAll(/"name":\s*"([^"]+)",\s*"value":\s*"([^"]+)"/g)].map(
    ([, name, value]) => [name, value]
  )
);
const px = (name: string): number => {
  const value = tokens.get(name) ?? "";
  const alias = /^\{(.+)\}$/.exec(value);
  return alias ? px(alias[1]) : parseFloat(value);
};
const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selector, body]) => ({
  selector: selector.trim(),
  body
}));

describe("empty media icon", () => {
  const bare = px("size-icon-xl");
  const bareSm = px("size-icon-lg");

  it("sizes every media icon from the base rule, so no variant falls back to the glyph size", () => {
    const base = rules.find((rule) => rule.selector === ".media svg");
    expect(base?.body).toMatch(/width:\s*var\(--v4-size-icon-xl\)/);
    expect(base?.body).toMatch(/height:\s*var\(--v4-size-icon-xl\)/);
  });

  it("never draws an Empty icon smaller than the bare size", () => {
    const sized = rules.filter((rule) => /svg/.test(rule.selector));
    expect(sized.length).toBeGreaterThan(0);
    sized.forEach(({ selector, body }) => {
      const floor = selector.includes('[data-size="sm"]') ? bareSm : bare;
      [...body.matchAll(/(?:width|height):\s*var\(--v4-([\w-]+)\)/g)].forEach(([, token]) => {
        expect(px(token), `${selector} uses ${token}`).toBeGreaterThanOrEqual(floor);
      });
    });
    expect(css).not.toMatch(/size-icon(?:-sm|-xs)?\)/);
  });
});
