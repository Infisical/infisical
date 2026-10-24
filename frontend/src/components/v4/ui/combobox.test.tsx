// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { V4Scope } from "../scope";
import { Combobox } from "./combobox";

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
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn()
  });
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

it("removes chips and keeps the search input focused for an empty-query Backspace", async () => {
  await React.act(async () =>
    root.render(
      <V4Scope>
        <Combobox
          label="Environments"
          multiple
          defaultValue={["dev", "prod"]}
          options={[
            { value: "dev", label: "Development" },
            { value: "prod", label: "Production" }
          ]}
        />
      </V4Scope>
    )
  );
  await React.act(async () => element('[aria-label="Remove Development"]').click());
  expect(document.querySelector('[aria-label="Remove Development"]')).toBeNull();
  await React.act(async () => element('button[aria-label="Environments"]').click());
  const input = element('input[role="combobox"]');
  expect(document.activeElement).toBe(input);
  await React.act(async () => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true })
    );
  });
  expect(document.querySelector('[aria-label="Remove Production"]')).toBeNull();
});
