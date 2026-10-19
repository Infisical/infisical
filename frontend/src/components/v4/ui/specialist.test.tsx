// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataGrid, type GridColumn } from "./data-grid";
import { DataTable } from "./data-table";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";
import { Field } from "./field";
import { FileTree } from "./file-tree";
import { List, ListRow } from "./list";
import { CopyButton, SecretInput, SensitiveEditor } from "./sensitive-editor";

let root: Root;
let host: HTMLDivElement;
const render = async (node: React.ReactNode) => {
  await React.act(async () => root.render(node));
};
const element = (selector: string): HTMLElement => {
  const found = host.querySelector(selector);
  if (!(found instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
  return found;
};
const click = async (target: HTMLElement) => {
  await React.act(async () => target.click());
};
const button = (text: string): HTMLElement => {
  const found = Array.from(host.querySelectorAll("button")).find(
    (item) => item.textContent === text
  );
  if (!found) throw new Error(`Missing button ${text}`);
  return found;
};
const key = async (target: HTMLElement, value: string, extra: KeyboardEventInit = {}) => {
  await React.act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: value, ...extra })
    );
  });
};
const clipboard = async (target: HTMLElement, kind: "copy" | "paste", text = "") => {
  const data = { getData: vi.fn(() => text), setData: vi.fn() };
  await React.act(async () => {
    const event = new Event(kind, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    target.dispatchEvent(event);
  });
  return data;
};
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
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(0), 0)
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("specialist foundation contracts", () => {
  it("awaits clipboard fulfillment and reports denial without success notification", async () => {
    let resolve: (() => void) | undefined;
    const onCopy = vi.fn();
    await render(
      <CopyButton
        value="public example"
        onCopy={onCopy}
        writeClipboard={() =>
          new Promise<void>((done) => {
            resolve = done;
          })
        }
      />
    );
    await click(button("Copy value"));
    expect(button("Copy value").getAttribute("aria-busy")).toBe("true");
    expect(onCopy).not.toHaveBeenCalled();
    await React.act(async () => resolve?.());
    expect(host.textContent).toContain("Copied");
    expect(onCopy).toHaveBeenCalledOnce();
    await render(
      <CopyButton
        value="another example"
        onCopy={onCopy}
        writeClipboard={async () => {
          throw new Error("Denied");
        }}
      />
    );
    await click(button("Copy value"));
    expect(host.textContent).toContain("Copy failed");
    expect(onCopy).toHaveBeenCalledOnce();
  });
  it("wires Field errors to the actual masked textbox", async () => {
    await render(
      <Field label="Stored value" error="Access expired">
        <SecretInput value="fabricated-value" />
      </Field>
    );
    const textbox = element('[role="textbox"]');
    const label = element("label");
    expect(textbox.id).toBe(label.getAttribute("for"));
    expect(textbox.getAttribute("aria-invalid")).toBe("true");
    const note = textbox.getAttribute("aria-describedby");
    expect(note && document.getElementById(note)?.textContent).toContain("Access expired");
    expect(host.innerHTML).not.toContain("fabricated-value");
  });
  it("remasks a read-only secret after replacement even when an earlier value returns", async () => {
    await render(<SecretInput value="first-fabricated" copyable={false} />);
    await click(button("Reveal value"));
    expect(host.textContent).toContain("first-fabricated");
    await render(<SecretInput value="second-fabricated" copyable={false} />);
    await render(<SecretInput value="first-fabricated" copyable={false} />);
    expect(host.innerHTML).not.toContain("first-fabricated");
  });
  it("replaces without reveal and rejects stale reveal when identity changes", async () => {
    let reveal: ((value: string) => void) | undefined;
    const onReveal = vi.fn(
      () =>
        new Promise<string>((done) => {
          reveal = done;
        })
    );
    const onSave = vi.fn(async () => {});
    const props = {
      stored: { id: "one", revision: "1", hasValue: true },
      label: "Protected",
      onReveal,
      onSave
    };
    await render(<SensitiveEditor {...props} />);
    await click(button("Replace without viewing"));
    expect(onReveal).not.toHaveBeenCalled();
    expect(element("textarea").textContent).toBe("");
    await click(button("Cancel"));
    await click(button("Reveal value"));
    await render(<SensitiveEditor {...props} stored={{ ...props.stored, id: "two" }} />);
    await React.act(async () => reveal?.("hidden-from-DOM"));
    expect(host.innerHTML).not.toContain("hidden-from-DOM");
  });
  it("retains a replacement draft when the host rejects save", async () => {
    const onSave = vi.fn(async () => {
      throw new Error("Synthetic host rejection");
    });
    await render(
      <SensitiveEditor
        stored={{ id: "draft", revision: "1", hasValue: true }}
        label="Replacement"
        onSave={onSave}
      />
    );
    await click(button("Replace without viewing"));
    await click(button("Save replacement"));
    expect(onSave).toHaveBeenCalledWith(
      "",
      expect.objectContaining({ stored: expect.objectContaining({ id: "draft" }) })
    );
    expect(host.textContent).toContain("Your draft is kept");
    expect(host.querySelector("textarea")).not.toBeNull();
  });
  it("keeps cell identity on reorder and blocks protected clipboard content", async () => {
    const first = { id: "a", value: "first" };
    const second = { id: "b", value: "second" };
    const rows = [first, second];
    const col: GridColumn<(typeof rows)[number]> = {
      id: "v",
      header: "Value",
      getValue: (row) => row.value
    };
    const props = {
      rows,
      columns: [col],
      getRowId: (row: (typeof rows)[number]) => row.id,
      label: "Values"
    };
    await render(<DataGrid {...props} />);
    await React.act(async () => {
      element('[role="gridcell"]').dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 })
      );
    });
    await render(<DataGrid {...props} rows={[second, first]} />);
    expect(element('[data-active="true"]').textContent).toBe("first");
    expect((await clipboard(element('[role="grid"]'), "copy")).setData).toHaveBeenCalledWith(
      "text/plain",
      "first"
    );
    await render(<DataGrid {...props} columns={[{ ...col, sensitive: true }]} />);
    expect((await clipboard(element('[role="grid"]'), "copy")).setData).not.toHaveBeenCalled();
    expect(host.innerHTML).not.toContain('title="first"');
    expect(host.textContent).toContain("Protected cells cannot be copied");
  });
  it("rejects invalid paste atomically and leaves document keyboard alone", async () => {
    const onCellsChange = vi.fn();
    const rows = [
      { id: "a", value: "1" },
      { id: "b", value: "2" }
    ];
    await render(
      <DataGrid
        rows={rows}
        columns={[{ id: "v", header: "Value", type: "int8", getValue: (row) => row.value }]}
        getRowId={(row) => row.id}
        label="Numbers"
        editable
        onCellsChange={onCellsChange}
      />
    );
    await key(element('[role="grid"]'), "ArrowDown");
    await clipboard(element('[role="grid"]'), "paste", "3\ninvalid");
    expect(onCellsChange).not.toHaveBeenCalled();
    expect(host.textContent).toContain("whole number");
    await clipboard(element('[role="grid"]'), "paste", "9007199254740993");
    expect(onCellsChange).toHaveBeenCalledWith(
      [expect.objectContaining({ rowId: "a", value: "9007199254740993" })],
      expect.anything()
    );
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowDown"
    });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
  it("rechecks edit permissions, protected columns and the original value before commit", async () => {
    const onCellsChange = vi.fn();
    const original = { id: "row", value: "original" };
    const column: GridColumn<typeof original> = {
      id: "value",
      header: "Value",
      getValue: (row) => row.value
    };
    const props = {
      rows: [original],
      columns: [column],
      getRowId: (row: typeof original) => row.id,
      label: "Editable",
      editable: true,
      onCellsChange
    };
    await render(<DataGrid {...props} />);
    await key(element('[role="grid"]'), "ArrowDown");
    await key(element('[role="grid"]'), "Enter");
    await render(<DataGrid {...props} editable={false} />);
    expect(host.querySelector("textarea")).toBeNull();
    await click(button("Apply cell"));
    expect(onCellsChange).not.toHaveBeenCalled();
    expect(host.textContent).toContain("no longer editable");
    await render(<DataGrid {...props} />);
    await key(element('[role="grid"]'), "Enter");
    await render(<DataGrid {...props} columns={[{ ...column, sensitive: true }]} />);
    expect(host.querySelector("textarea")).toBeNull();
    await click(button("Apply cell"));
    expect(onCellsChange).not.toHaveBeenCalled();
    await render(<DataGrid {...props} />);
    await key(element('[role="grid"]'), "Enter");
    await render(<DataGrid {...props} rows={[{ ...original, value: "host update" }]} />);
    await click(button("Apply cell"));
    expect(onCellsChange).not.toHaveBeenCalled();
    expect(host.textContent).toContain("value changed while you were editing");
    expect(element("textarea")).toHaveProperty("value", "original");
  });
  it("uses its actual automatic width for ARIA and the first resize step", async () => {
    const onColumnResize = vi.fn();
    await render(
      <DataGrid
        rows={[{ id: "row", value: "short" }]}
        columns={[{ id: "value", header: "Value", getValue: (row) => row.value }]}
        getRowId={(row) => row.id}
        label="Widths"
        onColumnResize={onColumnResize}
      />
    );
    const slider = element('[role="slider"]');
    const width = Number(slider.getAttribute("aria-valuenow"));
    expect(element('[role="grid"] > [role="row"]').style.gridTemplateColumns).toContain(
      `${width}px`
    );
    await key(slider, "ArrowRight");
    expect(onColumnResize).toHaveBeenLastCalledWith("value", width + 8);
    expect(element('[role="slider"]').getAttribute("aria-valuenow")).toBe(String(width + 8));
  });
  it("keeps sorting and resizing available at the 64px column minimum", async () => {
    const onColumnResize = vi.fn();
    const onSortChange = vi.fn();
    await render(
      <DataGrid
        rows={[{ id: "row", name: "Connection" }]}
        columns={[
          { id: "name", header: "Name", type: "text", width: 64, getValue: (row) => row.name }
        ]}
        getRowId={(row) => row.id}
        label="Minimum widths"
        onColumnResize={onColumnResize}
        onSortChange={onSortChange}
      />
    );
    const slider = element('[aria-label="Resize Name"]');
    expect(slider.getAttribute("aria-valuemin")).toBe("64");
    await key(slider, "ArrowLeft");
    expect(onColumnResize).toHaveBeenLastCalledWith("name", 64);
    expect(slider.getAttribute("aria-valuenow")).toBe("64");
    expect(element('[role="grid"] > [role="row"]').style.gridTemplateColumns).toContain("64px");
    expect(element('[role="columnheader"][aria-colindex="2"]').textContent).toContain("Name");
    expect(element('[role="columnheader"][aria-colindex="2"]').textContent).not.toContain("text");
    expect(element('[role="columnheader"][aria-colindex="2"] [title]').getAttribute("title")).toBe(
      "Name, text"
    );
    await click(element('[aria-label="Sort Name"]'));
    expect(onSortChange).toHaveBeenLastCalledWith({ columnId: "name", direction: "asc" });
    await key(slider, "ArrowRight");
    expect(onColumnResize).toHaveBeenLastCalledWith("name", 72);
    expect(slider.getAttribute("aria-valuenow")).toBe("72");
  });
  it("cancels only the grid edit before an enclosing Escape handler", async () => {
    const escape = vi.fn();
    await render(
      <div role="group" onKeyDown={escape}>
        <DataGrid
          rows={[{ id: "row", value: "original" }]}
          columns={[{ id: "value", header: "Value", getValue: (row) => row.value }]}
          getRowId={(row) => row.id}
          label="Nested"
          editable
          onCellsChange={vi.fn()}
        />
      </div>
    );
    await key(element('[role="grid"]'), "ArrowDown");
    await key(element('[role="grid"]'), "Enter");
    escape.mockClear();
    expect(element("textarea").closest("[data-v4-escape-owner]")).not.toBeNull();
    await key(element("textarea"), "Escape");
    expect(escape).not.toHaveBeenCalled();
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.querySelector("[data-v4-escape-owner]")).toBeNull();
    await key(element('[role="grid"]'), "Escape");
    expect(escape).toHaveBeenCalledOnce();
  });
  it("cancels grid editing before Radix capture can dismiss the dialog", async () => {
    const onOpenChange = vi.fn();
    await render(
      <Dialog defaultOpen onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Grid task</DialogTitle>
          <DialogDescription>Example values only</DialogDescription>
          <DataGrid
            rows={[{ id: "row", value: "original" }]}
            columns={[{ id: "value", header: "Value", getValue: (row) => row.value }]}
            getRowId={(row) => row.id}
            label="Overlay grid"
            editable
            onCellsChange={vi.fn()}
          />
        </DialogContent>
      </Dialog>
    );
    const grid = document.querySelector('[role="grid"]');
    if (!(grid instanceof HTMLElement)) throw new Error("Missing overlay grid");
    await key(grid, "ArrowDown");
    await key(grid, "Enter");
    const input = document.querySelector("textarea");
    if (!(input instanceof HTMLElement)) throw new Error("Missing overlay editor");
    await key(input, "Escape");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector("textarea")).toBeNull();
    await key(grid, "Escape");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it("starts navigation at the first filtered cell and never retargets a missing edit", async () => {
    const onCellsChange = vi.fn();
    const removed = { id: "removed", value: "old value" };
    const first = { id: "first", value: "first visible" };
    const second = { id: "second", value: "second visible" };
    const column: GridColumn<typeof first> = {
      id: "value",
      header: "Value",
      getValue: (row) => row.value
    };
    const props = {
      columns: [column],
      getRowId: (row: typeof first) => row.id,
      label: "Filtered rows",
      editable: true,
      onCellsChange
    };
    await render(<DataGrid {...props} rows={[removed, first, second]} />);
    await key(element('[role="grid"]'), "ArrowDown");
    await key(element('[role="grid"]'), "Enter");
    await render(<DataGrid {...props} rows={[first, second]} />);
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.textContent).toContain("draft was not applied");
    await key(element('[role="grid"]'), "ArrowDown");
    expect(element('[data-active="true"]').textContent).toBe("first visible");
    expect(onCellsChange).not.toHaveBeenCalled();
    await key(element('[role="grid"]'), "Enter");
    expect(element("textarea")).toHaveProperty("value", "first visible");
    expect(onCellsChange).not.toHaveBeenCalled();
  });
  it("bounds large-data DOM and keeps active descendant mounted", async () => {
    const rows = Array.from({ length: 10000 }, (_, i) => ({ id: String(i), value: String(i) }));
    await render(
      <DataGrid
        rows={rows}
        columns={[{ id: "v", header: "Value", getValue: (row) => row.value }]}
        getRowId={(row) => row.id}
        label="Large grid"
        height={200}
      />
    );
    expect(host.querySelectorAll('[role="row"]').length).toBeLessThan(30);
    await key(element('[role="grid"]'), "End", { ctrlKey: true });
    const active = element('[role="grid"]').getAttribute("aria-activedescendant");
    expect(active && document.getElementById(active)).toBeTruthy();
    await render(
      <DataTable
        label="Large table"
        rows={rows}
        columns={[{ id: "v", header: "Value", render: (row) => row.value }]}
        getRowId={(row) => row.id}
        rowLabel={(row) => row.value}
        height={200}
        virtual
      />
    );
    expect(host.querySelectorAll("tbody tr").length).toBeLessThan(30);
    expect(element("table").getAttribute("aria-rowcount")).toBe("10001");
  });
  it("keeps disabled tree nodes focusable but unselectable", async () => {
    const onSelect = vi.fn();
    await render(
      <FileTree
        items={[
          {
            id: "folder",
            name: "Folder",
            children: [
              { id: "locked", name: "Locked", disabled: true, label: "Locked, read only" },
              { id: "file", name: "File" }
            ]
          }
        ]}
        label="Files"
        onSelect={onSelect}
      />
    );
    await key(element('[role="treeitem"]'), "ArrowRight");
    await key(element('[role="treeitem"]'), "ArrowRight");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Locked, read only");
    if (!(document.activeElement instanceof HTMLElement)) throw new Error("Expected tree focus");
    await key(document.activeElement, "Enter");
    expect(onSelect).not.toHaveBeenCalled();
    await key(document.activeElement, "ArrowDown");
    if (!(document.activeElement instanceof HTMLElement)) throw new Error("Expected tree focus");
    await key(document.activeElement, "Enter");
    expect(onSelect).toHaveBeenCalledWith("file", expect.anything());
  });
  it("discloses folders by pointer without selecting them, isolates child clicks and restores collapsed focus", async () => {
    const onSelect = vi.fn();
    const items = [
      {
        id: "folder",
        name: "Folder",
        children: [{ id: "child", name: "Child", children: [{ id: "file", name: "File" }] }]
      }
    ];
    await render(<FileTree items={items} label="Pointer files" onSelect={onSelect} />);
    await click(element('[aria-label="Expand Folder"]'));
    expect(onSelect).not.toHaveBeenCalled();
    await click(element('[aria-label="Expand Child"]'));
    expect(onSelect).not.toHaveBeenCalled();
    await click(element('[role="treeitem"][aria-label="File"]'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("file", expect.anything());
    expect(document.activeElement?.getAttribute("aria-label")).toBe("File");
    await render(
      <FileTree items={items} label="Pointer files" onSelect={onSelect} expanded={[]} />
    );
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Folder");
    expect(element('[role="treeitem"][aria-label="Folder"]').getAttribute("tabindex")).toBe("0");
  });
  it("owns tree selection on treeitems while keeping the visible selected row marker", async () => {
    const onSelect = vi.fn();
    await render(
      <FileTree
        items={[
          { id: "one", name: "One" },
          { id: "two", name: "Two" }
        ]}
        label="Selection semantics"
        defaultSelected="one"
        onSelect={onSelect}
      />
    );
    const selected = element('[role="treeitem"][aria-label="One"]');
    expect(selected.getAttribute("aria-selected")).toBe("true");
    expect(host.querySelectorAll("[aria-selected]")).toHaveLength(2);
    expect(selected.firstElementChild?.getAttribute("data-selected")).toBe("true");
    await click(element('[role="treeitem"][aria-label="Two"]'));
    expect(onSelect).toHaveBeenCalledWith("two", expect.objectContaining({ id: "two" }));
    expect(selected.getAttribute("aria-selected")).toBe("false");
    const next = element('[role="treeitem"][aria-label="Two"]');
    expect(next.getAttribute("aria-selected")).toBe("true");
    expect(next.firstElementChild?.getAttribute("data-selected")).toBe("true");
    expect(
      [...host.querySelectorAll("[aria-selected]")].every(
        (node) => node.getAttribute("role") === "treeitem"
      )
    ).toBe(true);
  });
  it("reveals selected ancestors once and respects deliberate same-selection collapse", async () => {
    const items = [
      {
        id: "root",
        name: "Root",
        children: [
          { id: "a", name: "A", children: [{ id: "one", name: "One" }] },
          { id: "b", name: "B", children: [{ id: "two", name: "Two" }] }
        ]
      }
    ];
    await render(<FileTree items={items} label="Selected paths" selected="one" />);
    expect(element('[role="treeitem"][aria-label="A"]').getAttribute("aria-expanded")).toBe("true");
    expect(element('[role="treeitem"][aria-label="One"]').getAttribute("aria-selected")).toBe(
      "true"
    );
    await click(element('[aria-label="Collapse A"]'));
    await render(<FileTree items={items} label="Selected paths" selected="one" />);
    expect(element('[role="treeitem"][aria-label="A"]').getAttribute("aria-expanded")).toBe(
      "false"
    );
    await render(<FileTree items={items} label="Selected paths" selected="two" />);
    expect(element('[role="treeitem"][aria-label="B"]').getAttribute("aria-expanded")).toBe("true");
    expect(element('[role="treeitem"][aria-label="Two"]').getAttribute("aria-selected")).toBe(
      "true"
    );
  });
  it("only advertises editing and clipboard guidance when those cells exist", async () => {
    const columns = [
      { id: "value", header: "Value", getValue: (row: { id: string; value: string }) => row.value }
    ];
    const props = {
      label: "Guidance",
      columns,
      getRowId: (row: { id: string; value: string }) => row.id
    };
    await render(<DataGrid {...props} rows={[]} />);
    expect(element('[role="status"]').textContent).not.toContain("Enter edits");
    expect(element('[role="status"]').textContent).not.toContain("Select a cell");
    await render(<DataGrid {...props} rows={[{ id: "one", value: "example" }]} />);
    expect(element('[role="status"]').textContent).not.toContain("Enter edits");
    expect(element('[role="status"]').textContent).toContain("Select a cell");
    await render(
      <DataGrid
        {...props}
        rows={[{ id: "one", value: "example" }]}
        editable
        onCellsChange={vi.fn()}
      />
    );
    expect(element('[role="status"]').textContent).toContain("Enter edits");
  });
  it("selects eligible list rows without a locked owner", async () => {
    const onSelectionChange = vi.fn();
    await render(
      <List
        label="Members"
        title="Members"
        selection="multiple"
        onSelectionChange={onSelectionChange}
      >
        <ListRow value="owner" label="Owner" title="Owner" selectable={false} />
        <ListRow value="member" label="Member" title="Member" />
      </List>
    );
    await click(element('[aria-label="Select all Members"]'));
    expect(onSelectionChange).toHaveBeenCalledWith(["member"]);
  });
});
