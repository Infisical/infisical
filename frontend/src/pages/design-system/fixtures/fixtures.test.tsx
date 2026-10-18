// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { V4Scope } from "@app/components/v4/scope";

const modules = import.meta.glob<{ default: React.ComponentType }>("./*.tsx");

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", function ResizeObserverMock() {
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  });
  vi.stubGlobal("IntersectionObserver", function IntersectionObserverMock() {
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(), takeRecords: () => [] };
  });
  Element.prototype.scrollIntoView = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it.each(Object.keys(modules))("renders the state fixture %s", async (path) => {
  const { default: Fixture } = await modules[path]!();
  await React.act(async () =>
    root.render(
      <V4Scope>
        <Fixture />
      </V4Scope>
    )
  );
  expect(host.textContent?.trim()).toBeTruthy();
});
