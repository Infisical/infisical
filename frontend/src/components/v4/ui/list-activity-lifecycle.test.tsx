// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { List, ListRow } from "./list";

let root: Root;
let host: HTMLDivElement;
const render = async (children: React.ReactNode) => {
  await React.act(async () => root.render(children));
};
const element = (selector: string): HTMLElement => {
  const found = host.querySelector(selector);
  if (!(found instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
  return found;
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
});
const records = (ids: readonly string[]) => (
  <List label="Records">
    {ids.map((id) => (
      <ListRow key={id} value={id} title={id} label={id} onClick={() => {}} />
    ))}
  </List>
);

describe("List target lifetime", () => {
  it("moves a removed middle-row target to the next surviving row", async () => {
    await render(records(["A", "B", "C"]));
    await React.act(async () => element('[data-list-row="B"] [data-list-target]').focus());
    await render(records(["A", "C"]));
    expect(document.activeElement).toBe(element('[data-list-row="C"] [data-list-target]'));
  });
  it("moves a removed last-row target to the previous surviving row", async () => {
    await render(records(["A", "B"]));
    await React.act(async () => element('[data-list-row="B"] [data-list-target]').focus());
    await render(records(["A"]));
    expect(document.activeElement).toBe(element('[data-list-row="A"] [data-list-target]'));
  });
  it("focuses the named list fallback when the last main target disappears", async () => {
    await render(records(["A"]));
    await React.act(async () => element("[data-list-target]").focus());
    await render(records([]));
    expect(document.activeElement).toBe(element('ul[aria-label="Records"]'));
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
  });
  it("does not steal focus from an external control before or during the props update", async () => {
    const draw = (ids: readonly string[]) => (
      <>
        <input aria-label="External filter" />
        {records(ids)}
      </>
    );
    await render(draw(["A", "B"]));
    await React.act(async () => element('[data-list-row="B"] [data-list-target]').focus());
    const filter = element("input");
    await React.act(async () => filter.focus());
    await render(draw(["A"]));
    expect(document.activeElement).toBe(filter);
  });
});
