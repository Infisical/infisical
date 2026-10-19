// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { V4Scope } from "../scope";
import { Switcher } from "./switcher";

let root: Root;
let host: HTMLDivElement;
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView"
);
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn()
  });
  vi.stubGlobal("ResizeObserver", function resizeObserver() {
    return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  if (originalScrollIntoView)
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

it("focuses the nonsearchable switcher keyboard owner so arrows and Enter select", async () => {
  const onChange = vi.fn();
  await React.act(async () =>
    root.render(
      <V4Scope>
        <Switcher
          label="Projects"
          trigger={<button type="button">Switch project</button>}
          onChange={onChange}
          options={[
            { value: "one", label: "One" },
            { value: "two", label: "Two" }
          ]}
        />
      </V4Scope>
    )
  );
  await React.act(async () => host.querySelector<HTMLButtonElement>("button")?.click());
  expect(document.activeElement?.getAttribute("role")).toBe("listbox");
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Projects");
  const activeId = document.activeElement?.getAttribute("aria-activedescendant");
  expect(activeId).toBeTruthy();
  expect(activeId ? document.getElementById(activeId)?.textContent : null).toBe("One");
  await React.act(async () =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })
    )
  );
  await React.act(async () =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    )
  );
  expect(onChange).toHaveBeenCalledWith("two", expect.objectContaining({ value: "two" }));
});

it("clears the switcher filter after selecting and reopening", async () => {
  await React.act(async () =>
    root.render(
      <V4Scope>
        <Switcher
          searchable
          label="Projects"
          trigger={<button type="button">Switch project</button>}
          options={[
            { value: "one", label: "One" },
            { value: "two", label: "Two" }
          ]}
        />
      </V4Scope>
    )
  );
  const trigger = host.querySelector<HTMLButtonElement>("button");
  await React.act(async () => trigger?.click());
  const search = document.querySelector<HTMLInputElement>("[cmdk-input]");
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "One");
    search?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const one = [...document.querySelectorAll<HTMLElement>("[cmdk-item]")].find(
    (node) => node.textContent === "One"
  );
  await React.act(async () => one?.click());
  await React.act(async () => trigger?.click());
  expect(document.querySelector<HTMLInputElement>("[cmdk-input]")?.value).toBe("");
  expect([...document.querySelectorAll("[cmdk-item]")].map((node) => node.textContent)).toContain(
    "Two"
  );
});

it("clears the switcher's active descendant when the highlighted option is removed", async () => {
  const render = (options: { value: string; label: string }[]) =>
    root.render(
      <V4Scope>
        <Switcher
          defaultOpen
          label="Projects"
          trigger={<button type="button">Switch project</button>}
          options={options}
        />
      </V4Scope>
    );
  await React.act(async () => render([{ value: "one", label: "One" }]));
  const list = document.querySelector('[role="listbox"]');
  expect(list?.getAttribute("aria-activedescendant")).toBeTruthy();
  await React.act(async () => render([]));
  expect(list?.hasAttribute("aria-activedescendant")).toBe(false);
});
