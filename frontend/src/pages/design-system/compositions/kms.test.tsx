// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { V4Scope } from "@app/components/v4/scope";
import { TooltipProvider } from "@app/components/v4/ui/tooltip";

import { KeyId } from "./kms";

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
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const element = (selector: string) => {
  const node = document.querySelector<HTMLElement>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
};

const id = "3f6c1a2e-8b4d-4e0f-9a7c-51d2e8b06f14";

it("keeps the full key ID readable, revealable on focus and copyable", async () => {
  const writeText = vi.fn(() => Promise.resolve());
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  await React.act(async () =>
    root.render(
      <V4Scope>
        <TooltipProvider>
          <KeyId id={id} />
        </TooltipProvider>
      </V4Scope>
    )
  );
  const value = element("span[tabindex='0']");
  expect(value.querySelector(".sr-only")?.textContent).toBe(id);
  expect(value.getAttribute("title")).toBeNull();
  expect(value.tabIndex).toBe(0);
  await React.act(async () => value.focus());
  expect(element("[data-slot=tooltip-content]").textContent).toContain(id);
  const copy = [...document.querySelectorAll<HTMLElement>("[data-v4-button]")].find(
    (node) => node.textContent?.trim() === "Copy key ID"
  );
  await React.act(async () => copy?.click());
  expect(writeText).toHaveBeenCalledWith(id);
});
