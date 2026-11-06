// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { V4Scope } from "../scope";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

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
  const computed = window.getComputedStyle.bind(window);
  const spacing: Record<string, string> = { "--v4-space-8": "8px", "--v4-space-48": "48px" };
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = computed(element, pseudo);
    const read = style.getPropertyValue.bind(style);
    return Object.assign(style, {
      getPropertyValue: (name: string) => spacing[name] ?? read(name)
    });
  });
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: 1000
  });
  Object.defineProperty(document.documentElement, "clientHeight", {
    configurable: true,
    value: 800
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function rect(
    this: Element
  ) {
    if (!(this instanceof HTMLElement) || this.dataset.slot !== "popover-content")
      return DOMRect.fromRect();
    const [x = 0, y = 0] = (this.style.transform.match(/-?[\d.]+/g) ?? []).map(Number);
    return DOMRect.fromRect({ x: 200 + x, y: 200 + y, width: 300, height: 160 });
  });
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

const press = (target: Element, key: string, shiftKey = false) =>
  React.act(async () => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }));
  });

it("opens a draggable popover on its first field, moves it with the arrow keys and resets it when it reopens", async () => {
  function Harness() {
    const [open, setOpen] = React.useState(true);
    return (
      <V4Scope>
        <button type="button" data-testid="toggle" onClick={() => setOpen((value) => !value)}>
          Toggle
        </button>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger>Add comment</PopoverTrigger>
          <PopoverContent draggable aria-label="Comment">
            <textarea aria-label="Comment" />
          </PopoverContent>
        </Popover>
      </V4Scope>
    );
  }
  await React.act(async () => root.render(<Harness />));
  const content = () => document.querySelector<HTMLElement>('[data-slot="popover-content"]');
  const handle = document.querySelector<HTMLButtonElement>('[data-slot="popover-drag-handle"]');
  expect(handle?.getAttribute("aria-label")).toBe("Move");
  expect(content()?.style.transform).toBe("");
  expect(document.activeElement?.tagName).toBe("TEXTAREA");

  await press(handle!, "ArrowRight");
  await press(handle!, "ArrowDown", true);
  expect(content()?.style.transform).toBe("translate(8px, 48px)");

  const toggle = document.querySelector<HTMLButtonElement>('[data-testid="toggle"]')!;
  await React.act(async () => toggle.click());
  await React.act(async () => toggle.click());
  expect(content()?.style.transform).toBe("");
  expect(document.activeElement?.tagName).toBe("TEXTAREA");
});
