// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { componentCatalog } from "@app/components/v4/catalog";
import { V4Scope } from "@app/components/v4/scope";

const modules = import.meta.glob<{ default: React.ComponentType }>("./examples/**/*.tsx");
const propAxis = /^(?:([A-Z]\w*)\.)?(variant|size|tone|orientation|align|side|collapsible)$/;
const slotOf = (part: string) => part.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

const cases = componentCatalog.flatMap((definition) =>
  (definition.coverage ?? []).flatMap((axis) => {
    const match = propAxis.exec(axis.axis);
    if (!match) return [];
    const [, part, prop] = match;
    return axis.shown.map((entry) => ({
      name: `${definition.id}:${axis.axis}:${entry.value}`,
      module:
        definition.examples.find((example) => example.id === entry.exampleId)?.module ??
        `missing example ${entry.exampleId}`,
      label: entry.label,
      selector: `[data-${prop}="${entry.aliasOf ?? entry.value}"][data-slot="${axis.slot ?? slotOf(part ?? definition.exports[0])}"]`
    }));
  })
);

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
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn()
  }));
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: 1280
  });
  Object.defineProperty(document.documentElement, "clientHeight", {
    configurable: true,
    value: 800
  });
  const control = DOMRect.fromRect({ x: 400, y: 300, width: 120, height: 32 });
  const page = DOMRect.fromRect({ x: 0, y: 0, width: 1280, height: 800 });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function rect(
    this: Element
  ) {
    return this.contains(host) ? page : control;
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const triggerOf = (figure: Element) =>
  figure.querySelector<HTMLElement>(
    "[aria-haspopup], [aria-controls], [data-slot$='-trigger']:not([data-slot$='-menu-trigger'])"
  ) ?? figure.querySelector<HTMLElement>("[data-slot$='-trigger']");
const openedMatch = async (figure: Element, selector: string) => {
  const trigger = triggerOf(figure);
  if (!trigger) return undefined;
  const before = new Set(document.querySelectorAll(selector));
  await React.act(async () => {
    if (trigger.dataset.slot === "tooltip-trigger") trigger.focus();
    else if (trigger.dataset.slot === "context-menu-trigger")
      trigger.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 1, clientY: 1 })
      );
    else {
      trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
      trigger.click();
    }
  });
  const controlled = trigger.getAttribute("aria-controls");
  const content = controlled ? document.getElementById(controlled) : null;
  if (content) return content.matches(selector) ? content : content.querySelector(selector);
  return [...document.querySelectorAll(selector)].find(
    (node) => !before.has(node) && !node.closest("figure")
  );
};

it("covers every prop axis with at least one case", () => {
  expect(cases.length).toBeGreaterThan(0);
});

it.each(cases)("renders $name inside its captioned figure", async ({ module, label, selector }) => {
  const load = modules[module];
  expect(load, `Missing example module ${module}`).toBeDefined();
  const { default: Example } = await load();
  await React.act(async () =>
    root.render(
      <V4Scope>
        <Example />
      </V4Scope>
    )
  );
  const figures = [...host.querySelectorAll("figure")].filter(
    (figure) => figure.querySelector(":scope > figcaption")?.textContent === label
  );
  expect(figures.length, `No figure captioned "${label}"`).toBeGreaterThan(0);
  if (figures.some((figure) => figure.querySelector(selector))) return;
  const opened = await Promise.all(figures.map((figure) => openedMatch(figure, selector)));
  expect(opened.find(Boolean), `No ${selector} under "${label}"`).toBeDefined();
});
