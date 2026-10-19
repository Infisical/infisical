// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import AlertDialogExample from "./examples/alert-dialog/default";
import ButtonExample from "./examples/button/default";
import CheckboxExample from "./examples/checkbox/default";
import GridExample from "./examples/data-grid/workspace";
import DialogExample from "./examples/dialog/default";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
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
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const render = async (node: React.ReactNode) => {
  await React.act(async () => root.render(node));
};
const button = (label: string, within: ParentNode = document) => {
  const found = [...within.querySelectorAll("button")].find(
    (node) => (node.getAttribute("aria-label") ?? node.textContent) === label
  );
  if (!(found instanceof HTMLButtonElement)) throw new Error(`Missing ${label}`);
  return found;
};
const click = async (node: HTMLElement) => {
  await React.act(async () => node.click());
};
const edit = async (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value"
    )?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

it("keeps the action named and blocked while its pending state is visible", async () => {
  vi.useFakeTimers();
  await render(<ButtonExample />);
  const save = button("Save changes");
  await click(save);
  expect(save.textContent).toBe("Save changes");
  expect(save.getAttribute("aria-busy")).toBe("true");
  await React.act(async () => vi.advanceTimersByTimeAsync(900));
  expect(save.getAttribute("aria-busy")).toBeNull();
});
it("keeps an edited dialog value when closing and reopening the form", async () => {
  await render(<DialogExample />);
  await click(button("Edit environment"));
  const input = document.querySelector<HTMLInputElement>('[role="dialog"] input');
  if (!input) throw new Error("Missing name input");
  await edit(input, "preview-environment");
  await click(button("Save changes"));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await click(button("Edit environment"));
  expect(document.querySelector<HTMLInputElement>('[role="dialog"] input')?.value).toBe(
    "preview-environment"
  );
});
it("updates mixed parent selection without changing the protected child", async () => {
  await render(<CheckboxExample />);
  const parent = document.getElementById("checkbox-all");
  if (!parent) throw new Error("Missing parent selection");
  expect(parent.getAttribute("aria-checked")).toBe("mixed");
  await click(parent);
  expect(parent.getAttribute("aria-checked")).toBe("true");
  await click(parent);
  expect(parent.getAttribute("aria-checked")).toBe("false");
  expect(document.getElementById("checkbox-policy")?.getAttribute("aria-checked")).toBe("true");
});
it("commits and undoes the edited exact-value grid cell", async () => {
  await render(<GridExample />);
  const cell = host.querySelector<HTMLElement>('[role="gridcell"][aria-colindex="3"]');
  if (!cell) throw new Error("Missing count cell");
  expect(cell.textContent).toContain("9007199254740993");
  await React.act(async () => cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
  const input = host.querySelector("textarea");
  if (!input) throw new Error("Missing cell editor");
  await edit(input, "9007199254740995");
  await click(button("Apply cell"));
  expect(host.querySelector('[role="gridcell"][aria-colindex="3"]')?.textContent).toContain(
    "9007199254740995"
  );
  const grid = host.querySelector<HTMLElement>('[role="grid"]');
  if (!grid) throw new Error("Missing resource grid");
  await React.act(async () =>
    grid.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }))
  );
  expect(host.querySelector('[role="gridcell"][aria-colindex="3"]')?.textContent).toContain(
    "9007199254740993"
  );
});
it("opens and cancels a confirmation without removing its trigger", async () => {
  await render(<AlertDialogExample />);
  const trigger = button("Revoke access", host);
  await click(trigger);
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
    "Revoke client access?"
  );
  await click(button("Cancel"));
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
});
