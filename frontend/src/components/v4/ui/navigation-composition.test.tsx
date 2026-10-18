// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
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

it("keeps the Radix tab contract while the collection API changes the selected panel", async () => {
  const onChange = vi.fn();
  const ref = React.createRef<HTMLDivElement>();
  await React.act(async () =>
    root.render(
      <Tabs
        ref={ref}
        label="Connection views"
        onChange={onChange}
        tabs={[
          { value: "overview", label: "Overview", content: "Connection summary" },
          { value: "locked", label: "Locked", disabled: true },
          { value: "versions", label: "Versions", count: 4, content: "Version history" }
        ]}
      />
    )
  );
  expect(ref.current).toBe(host.firstElementChild);
  expect(host.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe(
    "Connection views"
  );
  const versions = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((node) =>
    node.textContent?.includes("Versions")
  );
  await React.act(async () =>
    versions?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))
  );
  expect(onChange).toHaveBeenCalledWith("versions");
  expect(versions?.getAttribute("aria-selected")).toBe("true");
  expect(host.querySelector('[role="tabpanel"][data-state="active"]')?.textContent).toBe(
    "Version history"
  );
  expect(host.querySelector<HTMLButtonElement>('[role="tab"][disabled]')?.textContent).toBe(
    "Locked"
  );
});

it("converts wheel input only while the horizontal tab list can scroll and honors owner cancellation", async () => {
  const render = (cancel: boolean) =>
    root.render(
      <Tabs defaultValue="one">
        <TabsList
          aria-label="Sections"
          onWheel={cancel ? (event) => event.preventDefault() : undefined}
        >
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one">Summary</TabsContent>
      </Tabs>
    );
  await React.act(async () => render(false));
  const list = host.querySelector<HTMLDivElement>('[role="tablist"]');
  if (!list) throw new Error("Missing tablist");
  Object.defineProperties(list, {
    scrollWidth: { configurable: true, value: 300 },
    clientWidth: { configurable: true, value: 100 }
  });
  const moving = new WheelEvent("wheel", { deltaY: 50, bubbles: true, cancelable: true });
  await React.act(async () => list.dispatchEvent(moving));
  expect(list.scrollLeft).toBe(50);
  expect(moving.defaultPrevented).toBe(true);
  list.scrollLeft = 200;
  const edge = new WheelEvent("wheel", { deltaY: 50, bubbles: true, cancelable: true });
  await React.act(async () => list.dispatchEvent(edge));
  expect(edge.defaultPrevented).toBe(false);
  await React.act(async () => render(true));
  list.scrollLeft = 0;
  const cancelled = new WheelEvent("wheel", { deltaY: 50, bubbles: true, cancelable: true });
  await React.act(async () => list.dispatchEvent(cancelled));
  expect(list.scrollLeft).toBe(0);
  expect(cancelled.defaultPrevented).toBe(true);
});
