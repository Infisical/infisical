// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import TooltipExample from "./examples/tooltip/parts";

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

it("opens component search from its advertised shortcut and ignores unrelated input", async () => {
  await render(<TooltipExample />);
  const trigger = button("Search components", host);
  const press = async (target: HTMLElement, options: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
      cancelable: true,
      ...options
    });
    await React.act(async () => target.dispatchEvent(event));
    return event;
  };
  await press(trigger, { repeat: true });
  await press(trigger, { shiftKey: true });
  await press(trigger, { isComposing: true });
  await press(document.body);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await press(trigger);
  const input = document.querySelector<HTMLInputElement>('[role="dialog"] input');
  if (!input) throw new Error("Missing component query");
  await edit(input, "table");
  expect((await press(input)).defaultPrevented).toBe(false);
  expect(input.value).toBe("table");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Table");
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("Input");
});
