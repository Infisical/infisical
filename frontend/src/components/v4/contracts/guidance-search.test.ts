import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

import { componentCatalog } from "../catalog";
import { searchComponents } from "./search";

it.each([
  ["table", "row taller scrolling"],
  ["card", "frame title rank"],
  ["snippet", "prompt sizes distinct"],
  ["sensitive-editor", "revision plaintext clipboard"],
  ["multi-select", "disabled ordering stale"],
  ["field", "custom explicit association"],
  ["toast", "queue clipboard retry"]
])("finds %s from its construction and recovery risk", (id, query) => {
  expect(searchComponents(componentCatalog, query).map((entry) => entry.id)).toContain(id);
  expect(searchComponents(componentCatalog, `${query} nonexistent-capability`)).toEqual([]);
});

it("exposes what a reviewer looks for through the public lookup without claiming it ran", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/ui-info.ts", "row", "taller", "scrolling"],
    { encoding: "utf8" }
  );
  expect(result.status).toBe(0);
  const table = JSON.parse(result.stdout).components.find(
    (entry: { id: string }) => entry.id === "table"
  );
  expect(table).toBeDefined();
  const criterion = table.guidance.rules.find(
    (rule: { id: string }) => rule.id === "table-virtual-metric-and-row-identity"
  );
  expect(criterion.detect.by).toBe("review");
  expect(criterion.detect.how).toMatch(/scroll/i);
  expect(criterion).not.toHaveProperty("passed");
});
