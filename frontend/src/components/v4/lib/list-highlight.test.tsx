// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { V4Scope } from "../scope";
import { Sidebar } from "../ui/sidebar";
import { ListHighlight } from "./list-highlight";

let host: HTMLDivElement;
let root: Root;
const frame = () =>
  React.act(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      })
  );
const thumb = (kind: "hover" | "selection") =>
  host.querySelector<HTMLElement>(`[data-thumb="${kind}"]`);
const fire = (target: Element, type: string) =>
  target.dispatchEvent(new Event(type, { bubbles: type !== "pointerleave" }));

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await React.act(async () =>
    root.render(
      <div role="menu" data-testid="list">
        <div role="menuitem" tabIndex={-1}>
          One
        </div>
        <div role="separator" />
        <div role="menuitemradio" aria-checked="true" tabIndex={-1}>
          Two
        </div>
        <div role="menuitem" tabIndex={-1}>
          Three
        </div>
        <ListHighlight />
      </div>
    )
  );
  await frame();
});
afterEach(() => {
  React.act(() => root.unmount());
  host.remove();
});

it("rests the selection thumb on the current row", () => {
  expect(thumb("selection")?.dataset.visible).toBe("true");
  expect(thumb("selection")?.dataset.target).toBe("1");
  expect(thumb("hover")?.dataset.visible).toBeUndefined();
});

it("keeps the hover thumb on the last row while the pointer crosses a gap", async () => {
  const [one] = host.querySelectorAll('[role="menuitem"]');
  fire(one, "pointerover");
  await frame();
  fire(host.querySelector('[role="separator"]') as Element, "pointerover");
  await frame();
  expect(thumb("hover")?.dataset.visible).toBe("true");
  expect(thumb("hover")?.dataset.target).toBe("0");
  expect(thumb("selection")?.dataset.visible).toBeUndefined();
});

it("hands back to the selection thumb when the pointer leaves the list", async () => {
  fire(host.querySelectorAll('[role="menuitem"]')[1], "pointerover");
  await frame();
  fire(host.querySelector('[role="menu"]') as Element, "pointerleave");
  await frame();
  expect(thumb("hover")?.dataset.visible).toBeUndefined();
  expect(thumb("selection")?.dataset.target).toBe("1");
});

it("starts the keyboard hover thumb on the selected row", async () => {
  const two = host.querySelector<HTMLElement>('[role="menuitemradio"]');
  two?.focus();
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  await frame();
  expect(thumb("hover")?.dataset.visible).toBe("true");
  expect(thumb("hover")?.dataset.target).toBe("1");
});

it("pins the hover thumb on a row whose popover is open after the pointer leaves", async () => {
  const [one, , three] = host.querySelectorAll<HTMLElement>("[role^='menuitem']");
  three.setAttribute("aria-haspopup", "menu");
  fire(three, "pointerover");
  await frame();
  three.setAttribute("data-state", "open");
  three.setAttribute("aria-expanded", "true");
  fire(host.querySelector('[role="menu"]') as Element, "pointerleave");
  await frame();
  expect(thumb("hover")?.dataset.visible).toBe("true");
  expect(thumb("hover")?.dataset.target).toBe("2");
  expect(thumb("selection")?.dataset.visible).toBeUndefined();
  fire(one, "pointerover");
  await frame();
  expect(thumb("hover")?.dataset.target).toBe("2");
  three.setAttribute("data-state", "closed");
  three.setAttribute("aria-expanded", "false");
  await frame();
  expect(thumb("hover")?.dataset.target).toBe("0");
  fire(host.querySelector('[role="menu"]') as Element, "pointerleave");
  await frame();
  expect(thumb("hover")?.dataset.visible).toBeUndefined();
  expect(thumb("selection")?.dataset.target).toBe("1");
});

it("keeps the rail flyout trigger highlighted while the pointer is in its flyout", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();

      unobserve = vi.fn();

      disconnect = vi.fn();
    }
  );
  await React.act(async () =>
    root.render(
      <V4Scope>
        <Sidebar
          collapsible
          defaultCollapsed
          current="home"
          sections={[
            { items: [{ id: "home", label: "Home", icon: "home" }] },
            {
              label: "Composites",
              icon: "building",
              items: [
                { id: "cards", label: "Cards" },
                { id: "lists", label: "Lists" }
              ]
            }
          ]}
        />
      </V4Scope>
    )
  );
  await frame();
  const trigger = host.querySelector<HTMLElement>('nav [aria-label="Composites"]');
  expect(trigger).not.toBeNull();
  await React.act(async () => {
    trigger?.focus();
    trigger?.dispatchEvent(new MouseEvent("pointerdown", { button: 0, bubbles: true }));
  });
  await frame();
  expect(trigger?.getAttribute("aria-expanded")).toBe("true");
  const flyout = document.querySelector('[role="menu"]');
  expect(flyout?.textContent).toContain("Cards");
  const nav = host.querySelector("nav") as HTMLElement;
  fire(nav, "pointerleave");
  fire(flyout as Element, "pointerover");
  await frame();
  const navThumb = (kind: "hover" | "selection") =>
    nav.querySelector<HTMLElement>(`[data-thumb="${kind}"]`);
  const rows = [...nav.querySelectorAll("[data-sidebar-target]")];
  expect(navThumb("hover")?.dataset.visible).toBe("true");
  expect(navThumb("hover")?.dataset.target).toBe(String(rows.indexOf(trigger as Element)));
  expect(navThumb("selection")?.dataset.visible).toBeUndefined();
  vi.unstubAllGlobals();
});
