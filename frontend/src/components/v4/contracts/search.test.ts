import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

import { baselineDefinitions } from "./baseline";
import { dataGridDefinition } from "./data-grid";
import { searchComponents } from "./search";

it("finds task concepts in limitations and matches separate whitespace terms without duplicate hits", () => {
  expect(searchComponents([dataGridDefinition], "nullable").map((entry) => entry.id)).toEqual([
    "data-grid"
  ]);
  expect(
    searchComponents([dataGridDefinition], "  nullable   DELETE ").map((entry) => entry.id)
  ).toEqual(["data-grid"]);
  expect(searchComponents([dataGridDefinition], "nullable imaginary-operation")).toEqual([]);
});

it("discovers component decisions, conditional rules, state guidance and presentation advice", () => {
  [
    "spreadsheet keyboard",
    "data-grid-usage",
    "starting value",
    "protected keys",
    "stable columns"
  ].forEach((query) => {
    expect(searchComponents([dataGridDefinition], query).map((entry) => entry.id)).toEqual([
      "data-grid"
    ]);
  });
});

it("finds a rule by what its reviewer looks for and by how it is detected", () => {
  expect(
    searchComponents([dataGridDefinition], "revoke permission review").map((entry) => entry.id)
  ).toEqual(["data-grid"]);
});

it("finds coverage axes, choices, labels, aliases and omission reasons with all-term matching", () => {
  const component = {
    ...dataGridDefinition,
    coverage: [
      {
        axis: "density-fixture",
        expected: ["compact-fixture", "roomy-fixture"],
        shown: [
          {
            value: "compact-fixture",
            exampleId: "default",
            label: "Peer comparison fixture",
            aliasOf: "regular-fixture"
          }
        ],
        omitted: [{ value: "roomy-fixture", reason: "Unsupported inherited fixture option" }]
      }
    ]
  };
  [
    "density-fixture",
    "roomy-fixture",
    "peer comparison",
    "regular-fixture",
    "unsupported inherited fixture"
  ].forEach((query) => {
    expect(searchComponents([component], query).map((entry) => entry.id)).toEqual(["data-grid"]);
  });
  expect(searchComponents([component], "density-fixture absent-fixture")).toEqual([]);
  expect(searchComponents([component, dataGridDefinition], " ")).toEqual([
    component,
    dataGridDefinition
  ]);
  expect(searchComponents(baselineDefinitions, "  ICON-LG  ").map((entry) => entry.id)).toEqual([
    "button"
  ]);
});

it("exposes declared sizes through the public CLI and keeps no-match exit behavior", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/ui-info.ts", "icon-lg"], {
    encoding: "utf8"
  });
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).components.map((entry: { id: string }) => entry.id)).toEqual([
    "button"
  ]);
  const noMatch = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/ui-info.ts", "icon-lg", "absent-fixture"],
    { encoding: "utf8" }
  );
  expect(noMatch.status).toBe(1);
  expect(JSON.parse(noMatch.stdout).components).toEqual([]);
});
