// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataGrid } from "./data-grid";
import { DataTable } from "./data-table";

let host: HTMLDivElement;
let root: Root;
let resize: Array<() => void>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  resize = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resize.push(() => callback([], this));
      }
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  x: left,
  y: top,
  toJSON() {}
});

describe("data content geometry", () => {
  it("uses an observed uniform virtual row height for the row, slice and spacer", async () => {
    let actualHeight = 65;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function measure(
      this: HTMLElement
    ) {
      return box(0, 0, 300, this.matches("tbody tr[aria-rowindex]") ? actualHeight : 0);
    });
    const rows = Array.from({ length: 100 }, (_, id) => ({ id: String(id) }));
    await React.act(async () =>
      root.render(
        <DataTable
          label="Observed rows"
          rows={rows}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.id}
          columns={[{ id: "name", header: "Name", render: (row) => row.id }]}
          height={200}
          virtual
          rowHeight={48}
        />
      )
    );
    const scroll = host.querySelector<HTMLElement>("[data-virtual]");
    expect(scroll).not.toBeNull();
    expect(scroll?.style.getPropertyValue("--v4-table-row-height")).toBe("65px");
    await React.act(async () => {
      if (scroll) scroll.scrollTop = 650;
      scroll?.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    expect(host.querySelector("tbody tr[aria-rowindex]")?.getAttribute("aria-rowindex")).toBe("8");
    expect(host.querySelector<HTMLElement>("tbody [data-spacer] td")?.style.height).toBe("390px");
    actualHeight = 80;
    await React.act(async () => resize.forEach((callback) => callback()));
    expect(scroll?.style.getPropertyValue("--v4-table-row-height")).toBe("80px");
    expect(host.querySelector("tbody tr[aria-rowindex]")?.getAttribute("aria-rowindex")).toBe("6");
    expect(host.querySelector<HTMLElement>("tbody [data-spacer] td")?.style.height).toBe("320px");
  });

  it("scrolls an offscreen keyboard-selected grid column into view without moving focus", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function measure(
      this: HTMLElement
    ) {
      if (this.getAttribute("role") === "grid") return box(0, 0, 200, 160);
      if (this.getAttribute("aria-rowindex") === "1") return box(0, 0, 400, 32);
      if (this.getAttribute("role") === "rowheader") return box(0, 32, 40, 32);
      if (this.getAttribute("role") === "gridcell") {
        return box(this.getAttribute("aria-colindex") === "3" ? 300 : 40, 32, 128, 32);
      }
      return box(0, 0, 0, 0);
    });
    await React.act(async () =>
      root.render(
        <DataGrid
          label="Narrow grid"
          rows={[{ id: "one", first: "exact", last: "value" }]}
          getRowId={(row) => row.id}
          columns={[
            { id: "first", header: "First", type: "text", getValue: (row) => row.first },
            { id: "last", header: "Last", type: "text", getValue: (row) => row.last }
          ]}
          height={160}
        />
      )
    );
    const grid = host.querySelector<HTMLElement>('[role="grid"]');
    if (!grid) throw new Error("Missing grid");
    Object.defineProperty(grid, "clientWidth", { configurable: true, value: 200 });
    Object.defineProperty(grid, "clientHeight", { configurable: true, value: 160 });
    grid.focus();
    await React.act(async () =>
      grid.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
    );
    await React.act(async () =>
      grid.dispatchEvent(new KeyboardEvent("keydown", { key: "End", ctrlKey: true, bubbles: true }))
    );
    expect(grid.scrollLeft).toBeGreaterThan(0);
    expect(grid.querySelector("[data-active]")?.getAttribute("aria-colindex")).toBe("3");
    expect(document.activeElement).toBe(grid);
  });
});
