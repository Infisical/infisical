import { expect, it } from "vitest";

import { legacyHashLink } from "./navigation";

it("maps the old hash URLs onto the workbench routes", () => {
  expect(legacyHashLink("#button/default")).toMatchObject({
    to: "/design-system/components/$group/$component",
    params: { group: "actions", component: "button" },
    hash: "default"
  });
  expect(legacyHashLink("#compare-secrets")).toMatchObject({
    to: "/design-system/comparisons/$comparison",
    params: { comparison: "secrets" }
  });
  expect(legacyHashLink("#colors")).toMatchObject({
    to: "/design-system/foundations/$page",
    params: { page: "color" }
  });
  expect(legacyHashLink("#filter-bar")).toMatchObject({
    to: "/design-system/patterns/$pattern",
    params: { pattern: "filter-bar" }
  });
  expect(legacyHashLink("#overview")).toMatchObject({ to: "/design-system" });
  expect(legacyHashLink("#workbench-content")).toBeUndefined();
});
