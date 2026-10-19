// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { V4Scope } from "@app/components/v4/scope";

import SafeCopy from "../fixtures/code-block-behavior";
import ChartStates from "./chart/states";
import ItemComposition from "./item/composition";

let root: Root;
let host: HTMLDivElement;
let clipboard: PropertyDescriptor | undefined;
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
  clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const render = async (children: React.ReactNode) => {
  await React.act(async () => root.render(<V4Scope>{children}</V4Scope>));
};
const button = (label: string) => {
  const found = [...host.querySelectorAll("button")].find((node) => node.textContent === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
};
it("copies exact safe JSON only after fulfillment and never exposes the redacted token", async () => {
  let finish: ((value?: void) => void) | undefined;
  const write = vi.fn<(value: string) => Promise<void>>(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: write }
  });
  await render(<SafeCopy />);
  await React.act(async () => button("Copy safe payload").click());
  expect(write.mock.calls[0]?.[0]).toContain("9007199254740993");
  expect(write.mock.calls[0]?.[0]).toContain('"  exact  "');
  expect(write.mock.calls[0]?.[0]).not.toContain("synthetic-token");
  expect(host.textContent).not.toContain("Safe payload copied");
  await React.act(async () => finish?.());
  expect(host.textContent).toContain("Safe payload copied");
});
it("keeps loading, empty and error chart states distinguishable", async () => {
  await render(<ChartStates />);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Request counts unavailable");
  expect(host.textContent).toContain("No requests yet");
  expect(host.querySelector('[role="status"]')?.textContent).toContain("Loading request counts");
});
it("compares all ItemMedia recipes and preserves a useful image fallback", async () => {
  await render(<ItemComposition />);
  expect(host.querySelector('[data-slot="item-media"][data-variant="default"]')).not.toBeNull();
  expect(host.querySelector('[data-slot="item-media"][data-variant="icon"]')).not.toBeNull();
  const image = host.querySelector('[data-slot="item-media"][data-variant="image"] img');
  expect(image?.getAttribute("alt")).toBe("Staging deployment manifest thumbnail");
  expect(image?.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
  if (!(image instanceof HTMLImageElement)) throw new Error("Missing manifest image");
  await React.act(async () => image.dispatchEvent(new Event("error")));
  expect(host.textContent).toContain("Manifest preview unavailable");
});
