// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import tokens from "../tokens.json";
import { DetailLayout } from "./layout";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

const token = (name: string) =>
  Object.values(tokens)
    .flatMap((family) =>
      family && typeof family === "object" && "tokens" in family && Array.isArray(family.tokens)
        ? (family.tokens as { name: string; value: unknown }[])
        : []
    )
    .find((entry) => entry.name === name)?.value;

const renderInScroller = async (asideHeight: number, scrollerHeight: number) => {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function height(
    this: HTMLElement
  ) {
    return this.dataset.slot === "detail-layout-aside" ? asideHeight : 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function height(
    this: HTMLElement
  ) {
    return this.dataset.scroller ? scrollerHeight : 0;
  });
  await React.act(async () =>
    root.render(
      <div data-scroller="true" style={{ overflowY: "auto" }}>
        <DetailLayout asideLabel="Details" aside={<p>Summary</p>}>
          <p>Content</p>
        </DetailLayout>
      </div>
    )
  );
  return host.querySelector<HTMLElement>('aside[aria-label="Details"]');
};

it("puts the named sidecar before the main column in the DOM", async () => {
  await React.act(async () =>
    root.render(
      <DetailLayout asideLabel="Details" aside={<button type="button">Copy ID</button>}>
        <button type="button">Add auth method</button>
      </DetailLayout>
    )
  );
  const aside = host.querySelector("aside");
  const [first, second] = [...host.querySelectorAll("button")].map((button) => button.textContent);
  expect(aside?.getAttribute("aria-label")).toBe("Details");
  expect(aside?.nextElementSibling?.getAttribute("data-slot")).toBe("detail-layout-main");
  expect([first, second]).toEqual(["Copy ID", "Add auth method"]);
});

it("sticks only when the whole sidecar fits in its scroll container", async () => {
  expect((await renderInScroller(400, 900))?.hasAttribute("data-sticky")).toBe(true);
});

it("scrolls with the page when the sidecar is taller than its scroll container", async () => {
  expect((await renderInScroller(1200, 900))?.hasAttribute("data-sticky")).toBe(false);
});

it("collapses at the size-sidecar-collapse token and sizes the sidecar from size-sidecar", () => {
  const css = readFileSync(path.join(import.meta.dirname, "detail-layout.module.css"), "utf8");
  const breakpoint = css.match(/@container detail-layout \(min-width: ([^)]+)\)/)?.[1];
  expect(breakpoint).toBe(token("size-sidecar-collapse"));
  expect(css).toContain("minmax(0, 1fr) var(--v4-size-sidecar)");
});
