// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";

import { Calendar } from "./calendar";

it("gives read-only dates the same compiled minimum cell width as selectable dates", async () => {
  const [{ default: tailwind }, { default: postcss }] = await Promise.all([
    import("@tailwindcss/postcss"),
    import("postcss")
  ]);
  const stylesheet = path.resolve("src/components/v4/v4.css");
  const css = await postcss([tailwind()]).process(await readFile(stylesheet, "utf8"), {
    from: stylesheet
  });
  const widthSelectors: string[] = [];
  css.root.walkRules((rule) => {
    rule.walkDecls("min-width", (declaration) => {
      if (declaration.value === "var(--cell-size)") widthSelectors.push(rule.selector);
    });
  });
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<Calendar defaultMonth={new Date(2026, 8, 1)} />);
  const dates = [...host.querySelectorAll("td[data-day]")];
  expect(dates.length).toBeGreaterThanOrEqual(28);
  expect(host.querySelector("button[data-day]")).toBeNull();
  dates.forEach((date) => {
    expect(
      widthSelectors.some((selector) => date.matches(selector)),
      date.textContent ?? undefined
    ).toBe(true);
  });
});
