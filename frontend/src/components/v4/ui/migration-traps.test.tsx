// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { V4Scope } from "../scope";
import { DataTable } from "./data-table";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { HIDDEN_SECRET_VALUE, SecretInput } from "./secret-input";
import { Table } from "./table";
import { Toggle } from "./toggle";
import { TooltipProvider } from "./tooltip";

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
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  React.act(() => root.unmount());
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

it("rejects v3 switch props on Toggle at compile time", () => {
  // @ts-expect-error Toggle is a pressed button; checked and onCheckedChange belong to Switch.
  const element = <Toggle checked onCheckedChange={() => undefined} aria-label="Preview" />;
  expect(element.type).toBe(Toggle);
});

it("masks SecretInput until focused and flags invisible characters", async () => {
  function Host() {
    const [value, setValue] = React.useState("api\u200bkey");
    return (
      <V4Scope>
        <TooltipProvider>
          <SecretInput value={value} onChange={setValue} />
        </TooltipProvider>
      </V4Scope>
    );
  }
  await React.act(async () => root.render(<Host />));
  const textarea = host.querySelector("textarea")!;
  expect(textarea.value).toBe(HIDDEN_SECRET_VALUE);
  expect(host.textContent).toContain("Value contains invisible characters");
  await React.act(async () => textarea.focus());
  expect(textarea.value).toBe("api\u200bkey");
});

it("points containerRef at the scroll container of Table and DataTable", async () => {
  const tableContainer = React.createRef<HTMLDivElement>();
  const dataContainer = React.createRef<HTMLDivElement>();
  await React.act(async () =>
    root.render(
      <V4Scope>
        <Table containerRef={tableContainer} />
        <DataTable
          label="Clients"
          rows={[{ id: "a" }]}
          columns={[{ id: "id", header: "Id", render: (row) => row.id }]}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.id}
          containerRef={dataContainer}
        />
      </V4Scope>
    )
  );
  expect(tableContainer.current?.dataset.slot).toBe("table-container");
  expect(dataContainer.current?.querySelector("table")).not.toBeNull();
  expect(dataContainer.current?.parentElement?.dataset.slot).toBe("data-table");
});

it("blocks Escape and the close button while a Dialog is pending", async () => {
  const onOpenChange = vi.fn();
  await React.act(async () =>
    root.render(
      <V4Scope>
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent pending aria-describedby={undefined}>
            <DialogTitle>Edit environment</DialogTitle>
          </DialogContent>
        </Dialog>
      </V4Scope>
    )
  );
  await React.act(async () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    )
  );
  expect(onOpenChange).not.toHaveBeenCalled();
  const close = document.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]');
  expect(close?.disabled).toBe(true);
});
