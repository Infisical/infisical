import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

import tokens from "@app/components/v4/tokens.json";

import { loadAgentDocument } from "./agent-source";

it("loads the exact canonical generated component Markdown without rewriting code", async () => {
  const document = await loadAgentDocument("button");
  expect(document.exact).toBe(true);
  expect(document.source).toBe("src/components/v4/docs/button.md");
  expect(document.markdown).toBe(
    readFileSync(new URL("../../components/v4/docs/button.md", import.meta.url), "utf8")
  );
});

it("builds foundation and rules documents from their canonical records", async () => {
  const shape = await loadAgentDocument("spacing-shape");
  expect(shape.exact).toBe(false);
  const shapeRecords: unknown = JSON.parse(
    shape.markdown.match(/```json\n([\s\S]*?)\n```/)?.[1] ?? "null"
  );
  expect(shapeRecords).toMatchObject({ shape: tokens.shape });
  expect(tokens.shape.tokens.find((entry) => entry.name === "corners")?.value).toBe("0");
  const colors = await loadAgentDocument("colors");
  const colorRecords: unknown = JSON.parse(
    colors.markdown.match(/```json\n([\s\S]*?)\n```/)?.[1] ?? "null"
  );
  expect(colorRecords).toMatchObject({ color: tokens.color });
  expect(tokens.color.tokens.some((token) => token.name === "button-face-start")).toBe(true);
  expect(colors.markdown).toContain('"button-bloom"');
  const rules = await loadAgentDocument("rules");
  expect(rules.markdown).toContain("## Canonical rules");
  expect(rules.markdown).toContain('"protectedContent"');
  await expect(loadAgentDocument("missing-destination")).rejects.toThrow("no agent document");
});
