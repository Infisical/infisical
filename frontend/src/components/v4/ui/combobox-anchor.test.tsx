// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { V4Scope } from "../scope";
import { Combobox } from "./combobox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";

let root: Root;
let host: HTMLDivElement;
const fieldRect = { x: 120, y: 240, width: 320, height: 32 };
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
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn()
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function rect(
    this: Element
  ) {
    const anchored =
      this.matches('[data-slot="field-anchor"]') ||
      (this.tagName === "BUTTON" && this.getAttribute("role") === "combobox");
    const { x, y, width, height } = anchored ? fieldRect : { x: 0, y: 0, width: 0, height: 0 };
    return DOMRect.fromRect({ x, y, width, height });
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

it.each([false, true])(
  "anchors the open list to its field inside a Dialog (multiple: %s)",
  async (multiple) => {
    const options = [
      { value: "dev", label: "Development" },
      { value: "prod", label: "Production" }
    ];
    await React.act(async () =>
      root.render(
        <React.StrictMode>
          <V4Scope>
            <Dialog open>
              <DialogContent>
                <DialogTitle>Add member</DialogTitle>
                <DialogDescription>Pick environments.</DialogDescription>
                {multiple ? (
                  <Combobox label="Environments" multiple options={options} />
                ) : (
                  <Combobox label="Environment" options={options} />
                )}
              </DialogContent>
            </Dialog>
          </V4Scope>
        </React.StrictMode>
      )
    );
    const field = multiple
      ? document.querySelector<HTMLElement>('[data-slot="multi-select"]')?.parentElement
      : document.querySelector<HTMLElement>('button[role="combobox"]');
    field?.setAttribute("data-slot", multiple ? "field-anchor" : "combobox-trigger");
    await React.act(async () =>
      document
        .querySelector<HTMLElement>(
          multiple ? '[data-slot="multi-select"]' : 'button[role="combobox"]'
        )
        ?.click()
    );
    await React.act(
      async () =>
        new Promise((resolve) => {
          setTimeout(resolve, 50);
        })
    );
    const wrapper = document.querySelector<HTMLElement>("[data-radix-popper-content-wrapper]");
    const transform = wrapper?.style.transform ?? "";
    const [, x, y] = transform.match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\)/) ?? [];
    expect(Number(x)).toBe(fieldRect.x);
    const gap = Math.min(
      Math.abs(Number(y) - (fieldRect.y + fieldRect.height)),
      Math.abs(Number(y) - fieldRect.y)
    );
    expect(gap).toBeLessThanOrEqual(8);
  }
);
