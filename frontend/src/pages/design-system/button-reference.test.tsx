// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { componentCatalog } from "@app/components/v4/catalog";

import { ComponentPreviewPage } from "./ComponentPreviewPage";

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
const click = async (node: HTMLElement) => {
  await React.act(async () => node.click());
};

it("renders the supported Button comparisons and keeps pending actions named", async () => {
  await render(
    <React.Suspense fallback={null}>
      <ComponentPreviewPage page="button" />
    </React.Suspense>
  );
  await vi.waitFor(
    async () => {
      await React.act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });
      });
      expect(host.querySelectorAll('[data-example-state="mounted"]')).toHaveLength(
        componentCatalog.find((entry) => entry.id === "button")?.examples.length ?? 0
      );
    },
    { timeout: 5000 }
  );
  const variants = host.querySelector('[data-example="default"]');
  const shown = new Set(
    [...(variants?.querySelectorAll('[data-slot="button"]') ?? [])].map((node) =>
      node.getAttribute("data-variant")
    )
  );
  ["default", "outline", "ghost", "destructive", "link"].forEach((variant) =>
    expect(shown.has(variant)).toBe(true)
  );
  const sizes = host.querySelector('[data-example="sizes"]');
  ["default", "md", "lg", "icon", "icon-lg"].forEach((size) =>
    expect(sizes?.querySelector(`[data-size="${size}"]`)).not.toBeNull()
  );
  const pending = host.querySelector<HTMLButtonElement>(
    '[data-example="states"] button[aria-busy="true"]'
  );
  if (!pending) throw new Error("Missing pending action");
  await click(pending);
  expect(pending.textContent).toBe("Save changes");
  expect(host.querySelector('[data-example-state="error"]')).toBeNull();
});
