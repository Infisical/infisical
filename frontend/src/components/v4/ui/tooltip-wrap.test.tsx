// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { V4Scope } from "../scope";
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

const block = (file: string, selector: string) => {
  const css = readFileSync(path.join(import.meta.dirname, file), "utf8");
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf("}", start));
};

it("resets white-space on tooltip and overlay surfaces and caps tooltips at the token", () => {
  const tooltip = block("menu.module.css", ".tooltip");
  expect(tooltip).toContain("white-space: normal");
  expect(tooltip).toContain("var(--v4-size-tooltip-max)");
  expect(block("menu.module.css", ".surface")).toContain("white-space: normal");
  expect(block("overlay.module.css", ".pop")).toContain("white-space: normal");
});

it("renders long tooltip text without a nowrap class, even from a nowrap cell", async () => {
  await React.act(async () =>
    root.render(
      <V4Scope>
        <TooltipProvider>
          <table>
            <tbody>
              <tr>
                <td style={{ whiteSpace: "nowrap" }}>
                  <Tooltip
                    open
                    content="A long explanation that has to wrap inside the tooltip box"
                  >
                    <button type="button">Why</button>
                  </Tooltip>
                </td>
              </tr>
            </tbody>
          </table>
        </TooltipProvider>
      </V4Scope>
    )
  );
  const content = document.querySelector<HTMLElement>('[data-slot="tooltip-content"]');
  expect(content).not.toBeNull();
  expect(content?.className).not.toMatch(/whitespace-nowrap/);
  expect(content?.closest("td")).toBeNull();
});
