import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { DataList } from "./list";

it("pairs consecutive compact half items and leaves a lone half full width", () => {
  const html = renderToStaticMarkup(
    <DataList
      variant="props"
      density="compact"
      items={[
        ["ID", "4b1e8c2a"],
        ["Created", "Mar 4, 2026", { span: "half" }],
        ["Delete protection", "On", { span: "half" }],
        ["Country", "CA", { span: "half" }],
        ["Last login", "Never"]
      ]}
    />
  );
  const spans = Array.from(html.matchAll(/<div class="[^"]*"( data-span="half")?>/g), (m) =>
    Boolean(m[1])
  );
  expect(html).toContain('data-density="compact"');
  expect(spans).toEqual([false, true, true, false, false]);
});
