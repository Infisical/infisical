// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { V4Scope } from "../scope";
import { DataTable, type DataTableColumn } from "./data-table";
import { FloatingActionBar } from "./floating-action-bar";

type Row = { id: string; name: string; region: string };

const rows: Row[] = [
  { id: "a", name: "alpha", region: "us-east" },
  { id: "b", name: "beta", region: "eu-west" }
];
const columns: DataTableColumn<Row>[] = [
  { id: "name", header: "Name", primary: true, grow: true, render: (row) => row.name },
  { id: "region", header: "Region", width: 120, render: (row) => row.region },
  {
    id: "actions",
    header: "Actions",
    actions: true,
    width: 48,
    render: (row) => (
      <button type="button" aria-label={`Actions for ${row.name}`}>
        ...
      </button>
    )
  }
];

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();

      unobserve = vi.fn();

      disconnect = vi.fn();
    }
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn()
    }))
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const render = async (node: React.ReactNode) => {
  await React.act(async () => root.render(<V4Scope>{node}</V4Scope>));
};
const bodyRows = () => [...document.querySelectorAll<HTMLTableRowElement>("tbody tr")];
const cell = (row: number, column: number) =>
  bodyRows()[row].querySelectorAll<HTMLTableCellElement>("td")[column];
const click = async (target: Element) => {
  await React.act(async () => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
  });
};
const key = async (target: Element, value: string) => {
  await React.act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: value }));
  });
};

it("activates a row from a cell click and Enter, but not from its controls", async () => {
  const onRowActivate = vi.fn();
  await render(
    <DataTable
      label="Hosts"
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.name}
      selectable
      onRowActivate={onRowActivate}
    />
  );
  const [first, second] = bodyRows();
  expect(first.tabIndex).toBe(0);
  expect(first.hasAttribute("data-activatable")).toBe(true);

  await click(cell(0, 2));
  expect(onRowActivate).toHaveBeenLastCalledWith(rows[0]);

  await click(first.querySelector("button[aria-label='Actions for alpha']")!);
  await click(cell(0, 0));
  await click(first.querySelector("[role=checkbox]")!);
  expect(onRowActivate).toHaveBeenCalledTimes(1);

  await key(second, "Enter");
  expect(onRowActivate).toHaveBeenLastCalledWith(rows[1]);
  await key(second.querySelector("td")!, "Enter");
  expect(onRowActivate).toHaveBeenCalledTimes(2);
});

it("ignores a click that ends a text selection inside the row", async () => {
  const onRowActivate = vi.fn();
  await render(
    <DataTable
      label="Hosts"
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.name}
      onRowActivate={onRowActivate}
    />
  );
  const text = cell(0, 1).querySelector("div")!.firstChild!;
  vi.spyOn(window, "getSelection").mockReturnValue({
    isCollapsed: false,
    anchorNode: text
  } as unknown as Selection);
  await click(cell(0, 1));
  expect(onRowActivate).not.toHaveBeenCalled();
});

it("toggles selection with Space on a focused selectable row", async () => {
  const onSelectionChange = vi.fn();
  await render(
    <DataTable
      label="Hosts"
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.name}
      selectable
      onSelectionChange={onSelectionChange}
      onRowActivate={() => {}}
    />
  );
  await key(bodyRows()[1], " ");
  expect(onSelectionChange).toHaveBeenLastCalledWith(["b"]);
});

it("renders shaped skeleton rows with the loaded column widths while loading", async () => {
  await render(
    <DataTable
      label="Hosts"
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.name}
      selectable
      loading
    />
  );
  const table = document.querySelector("table")!;
  expect(table.getAttribute("aria-busy")).toBe("true");
  expect(table.dataset.layout).toBe("fixed");
  expect(bodyRows()).toHaveLength(5);
  expect(bodyRows().every((row) => row.hasAttribute("data-loading"))).toBe(true);
  expect(bodyRows()[0].querySelectorAll("td")).toHaveLength(4);
  expect(bodyRows()[0].querySelectorAll("[data-slot=skeleton]")).toHaveLength(4);
  expect(document.querySelector("tbody")!.textContent).not.toContain("alpha");
  const loadingWidths = [...bodyRows()[0].querySelectorAll("td")].map((td) => td.style.width);

  await render(
    <DataTable
      label="Hosts"
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.name}
      selectable
      loadingRows={2}
    />
  );
  expect(bodyRows()).toHaveLength(2);
  expect([...bodyRows()[0].querySelectorAll("td")].map((td) => td.style.width)).toEqual(
    loadingWidths
  );
});

it("keeps the automatic layout when a column has no width", async () => {
  await render(
    <DataTable
      label="Hosts"
      rows={rows}
      columns={[...columns.slice(0, 2), { ...columns[2], width: undefined }]}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.name}
      loading
      loadingRows={3}
    />
  );
  expect(document.querySelector("table")!.dataset.layout).toBeUndefined();
  expect(bodyRows()).toHaveLength(3);
});

it("renders the pagination slot inside the table frame, below the rows", async () => {
  await render(
    <DataTable
      label="Hosts"
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.name}
      pagination={<nav aria-label="Host pages">1-2 of 2</nav>}
    />
  );
  const slot = document.querySelector("[data-slot=data-table-pagination]")!;
  const table = document.querySelector("table")!;
  expect(slot.parentElement?.contains(table)).toBe(true);
  expect(slot.previousElementSibling?.contains(table)).toBe(true);
  expect(slot.textContent).toBe("1-2 of 2");
});

it("reserves room for a hosted floating action bar only while it shows", async () => {
  const table = (count: number, placement?: "fixed" | "contained") => (
    <DataTable
      label="Hosts"
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.name}
      selectable
      actionBar={<FloatingActionBar count={count} placement={placement} onClear={() => {}} />}
    />
  );
  const shell = () => document.querySelector<HTMLElement>("[data-slot=data-table]")!;
  await render(table(0));
  expect(shell().dataset.actionBar).toBeUndefined();
  await render(table(2));
  expect(shell().dataset.actionBar).toBe("fixed");
  await render(table(2, "contained"));
  expect(shell().dataset.actionBar).toBe("contained");
  await render(table(0, "contained"));
  expect(shell().dataset.actionBar).toBeUndefined();
});
