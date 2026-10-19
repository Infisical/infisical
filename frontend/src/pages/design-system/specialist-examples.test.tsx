// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { dataGridDefinition } from "@app/components/v4/contracts/data-grid";

import GridWorkspace from "./examples/data-grid/workspace";
import ResourceTable from "./examples/table/data-table";
import HostChanges from "./fixtures/data-grid-host-changes";
import ClipboardExample from "./fixtures/sensitive-editor-clipboard";

let host: HTMLDivElement;
let root: Root;
let clipboard: PropertyDescriptor | undefined;
beforeEach(() => {
  clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", function ResizeObserverMock() {
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  ["resource table", ResourceTable, "Name"],
  ["exact-value grid", GridWorkspace, "Count"]
])("keeps %s sort state controlled across repeated activation", async (_, Example, label) => {
  await React.act(async () => root.render(<Example />));
  const sortButton = Array.from(host.querySelectorAll("button")).find(
    (button) =>
      button.getAttribute("aria-label") === `Sort ${label}` || button.textContent === label
  );
  if (!sortButton) throw new Error(`Missing ${label} sort`);
  await React.act(async () => sortButton.click());
  expect(sortButton.closest('[role="columnheader"], th')?.getAttribute("aria-sort")).toBe(
    "ascending"
  );
  if (label === "Count") {
    expect(
      host.querySelector('[role="row"][aria-rowindex="3"] [role="gridcell"][aria-colindex="3"]')
        ?.textContent
    ).toBe("2");
  }
  await React.act(async () => sortButton.click());
  expect(sortButton.closest('[role="columnheader"], th')?.getAttribute("aria-sort")).toBe(
    "descending"
  );
  if (label === "Count") {
    expect(
      host.querySelector('[role="row"][aria-rowindex="2"] [role="gridcell"][aria-colindex="3"]')
        ?.textContent
    ).toBe("9007199254740993");
  }
});

it("copies the exact public identifier and blocks protected copying", async () => {
  const write = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: write }
  });
  await React.act(async () => root.render(<ClipboardExample />));
  const copy = [...host.querySelectorAll("button")].find(
    (node) => node.textContent === "Copy identifier"
  );
  const protectedCopy = [...host.querySelectorAll("button")].find(
    (node) => node.textContent === "Copy protected identifier"
  );
  if (!copy || !protectedCopy) throw new Error("Missing copy capabilities");
  await React.act(async () => {
    copy.click();
    protectedCopy.click();
  });
  expect(write).toHaveBeenCalledExactlyOnceWith("example-resource-id");
  expect(protectedCopy.disabled).toBe(true);
});

it("references the rendered custom-parser column label in declared coverage", async () => {
  await React.act(async () => root.render(<HostChanges />));
  const entry = dataGridDefinition.coverage
    .flatMap((axis) => axis.omitted ?? [])
    .find((value) => value.value === "custom-parse-format");
  const label = "Monthly cost in cents";
  expect(entry?.reason).toContain(label);
  expect(
    Array.from(host.querySelectorAll('[role="columnheader"]')).some(
      (header) => header.textContent === label
    )
  ).toBe(true);
});
