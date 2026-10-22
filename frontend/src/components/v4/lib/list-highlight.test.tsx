// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";

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
