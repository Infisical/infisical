// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { V4Scope } from "../scope";
import { Button } from "./button";
import { Table, TableBody, TableCell, TableRow } from "./table";
import { Tooltip, TooltipProvider } from "./tooltip";

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

const renderTable = (extra?: React.ReactNode) =>
  React.act(async () =>
    root.render(
      <V4Scope>
        <TooltipProvider>
          <Table aria-label="Secrets">
            <TableBody>
              {["DATABASE_URL", "LOG_LEVEL"].map((name) => (
                <TableRow key={name}>
                  <TableCell>
                    <Tooltip content={<strong>{`Copy ${name}`}</strong>}>
                      <button type="button">{name}</button>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Button disabledReason="Locked secrets can't be rotated">Rotate</Button>
                  </TableCell>
                </TableRow>
              ))}
              {extra}
            </TableBody>
          </Table>
        </TooltipProvider>
      </V4Scope>
    )
  );

const focusByKeyboard = async (element: HTMLElement) =>
  React.act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    element.focus();
    await Promise.resolve();
  });

it("renders table tooltips as marked elements with no tooltip roots until one is used", async () => {
  await renderTable();
  const triggers = host.querySelectorAll("[data-v4-tooltip]");
  expect(triggers).toHaveLength(4);
  expect(host.querySelector('[data-slot="tooltip-trigger"]')).toBeNull();
  expect(document.querySelector('[data-slot="tooltip-content"]')).toBeNull();
});

it("shows one shared tooltip for the focused trigger, described by its rich content", async () => {
  await renderTable();
  const [first, second] = [...host.querySelectorAll<HTMLButtonElement>("td button")];
  await focusByKeyboard(first);
  const content = document.querySelector<HTMLElement>('[data-slot="tooltip-content"]');
  expect(content?.querySelector("strong")?.textContent).toBe("Copy DATABASE_URL");
  expect(document.getElementById(first.getAttribute("aria-describedby") ?? "")).not.toBeNull();

  await focusByKeyboard(second);
  const contents = document.querySelectorAll('[data-slot="tooltip-content"]');
  expect(contents).toHaveLength(1);
  expect(contents[0].textContent).toContain("Locked secrets can't be rotated");
  expect(first.hasAttribute("aria-describedby")).toBe(false);
  expect(second.getAttribute("aria-description")).toBe("Locked secrets can't be rotated");

  await React.act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(document.querySelector('[data-slot="tooltip-content"]')).toBeNull();
  expect(second.hasAttribute("aria-describedby")).toBe(false);
});

it("keeps a controlled Tooltip inside a table on its own root", async () => {
  await renderTable(
    <TableRow>
      <TableCell>
        <Tooltip open content="Always shown">
          <button type="button">Pinned</button>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
  expect(host.querySelector('[data-slot="tooltip-trigger"]')?.textContent).toBe("Pinned");
  expect(document.querySelector('[data-slot="tooltip-content"]')?.textContent).toContain(
    "Always shown"
  );
});
