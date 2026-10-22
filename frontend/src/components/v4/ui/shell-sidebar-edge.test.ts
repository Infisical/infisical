import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = (file: string) => readFileSync(path.join(import.meta.dirname, file), "utf8");
const rules = (source: string) =>
  [...source.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
    ([, selector, body]) => ({ selector: selector.trim(), body })
  );
const specificity = (selector: string) =>
  (selector.match(/\.[\w-]+|\[[^\]]+\]|:(?!not\()[\w-]+/g) ?? []).length;

describe("shell-hosted Sidebar edge", () => {
  const shellRule = rules(css("top-bar.module.css")).find(
    ({ selector, body }) =>
      selector.startsWith('.shell > [data-slot="sidebar"]') &&
      /border-inline-end-color:\s*transparent/.test(body)
  );

  it("hides the Sidebar's own edge inside AppShell", () => {
    expect(shellRule).toBeDefined();
  });

  it("outranks every Sidebar edge rule regardless of stylesheet order", () => {
    const edges = rules(css("sidebar.module.css")).filter(({ body }) =>
      /border-(?:right|inline-end)(?:-color)?\s*:/.test(body)
    );
    expect(edges.length).toBeGreaterThan(0);
    edges.forEach(({ selector }) =>
      selector
        .split(",")
        .forEach((part) =>
          expect(specificity(shellRule?.selector ?? "")).toBeGreaterThan(specificity(part.trim()))
        )
    );
  });
});

describe("TopBar layering", () => {
  it("isolates page content under the island so no component z-index paints over the TopBar", () => {
    const content = rules(css("top-bar.module.css")).find(({ selector }) =>
      selector.startsWith(".inset > :not(.topBar)")
    );
    expect(content?.body).toMatch(/isolation:\s*isolate/);
    const bar = rules(css("top-bar.module.css")).find(({ selector }) => selector === ".topBar");
    expect(bar?.body).toMatch(/position:\s*sticky/);
    expect(bar?.body).toMatch(/z-index:\s*[1-9]/);
  });
});
