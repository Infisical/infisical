// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { V4Scope } from "../scope";
import { Field } from "./field";
import { MultiSelect } from "./multi-select";
import { Textarea } from "./textarea";

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

it("renders a node label and keeps it associated with the control", async () => {
  await React.act(async () =>
    root.render(
      <V4Scope>
        <Field
          label={
            <>
              Policy <span data-testid="hint">info</span>
            </>
          }
        >
          <Textarea mono />
        </Field>
      </V4Scope>
    )
  );
  const textarea = host.querySelector("textarea");
  const label = document.getElementById(textarea?.getAttribute("aria-labelledby") ?? "");
  expect(label?.querySelector('[data-testid="hint"]')).not.toBeNull();
  expect(textarea?.hasAttribute("data-mono")).toBe(true);
});

it("keeps a plain textarea free of the mono marker", async () => {
  await React.act(async () => root.render(<Textarea aria-label="Notes" />));
  expect(host.querySelector("textarea")?.hasAttribute("data-mono")).toBe(false);
});

const renderMultiSelect = (closeOnFocusOutside?: boolean) =>
  React.act(async () =>
    root.render(
      <V4Scope>
        <input aria-label="Outside" />
        <MultiSelect
          label="Permissions"
          defaultOpen
          closeOnFocusOutside={closeOnFocusOutside}
          options={[
            { value: "read", label: "Read" },
            { value: "write", label: "Write" }
          ]}
        />
      </V4Scope>
    )
  );

it("closes a MultiSelect when focus moves outside by default", async () => {
  await renderMultiSelect();
  expect(document.querySelector('[role="listbox"]')).not.toBeNull();
  await React.act(async () =>
    host.querySelector<HTMLInputElement>('[aria-label="Outside"]')?.focus()
  );
  expect(document.querySelector('[role="listbox"]')).toBeNull();
});

it("keeps a MultiSelect open on outside focus with closeOnFocusOutside off", async () => {
  await renderMultiSelect(false);
  await React.act(async () =>
    host.querySelector<HTMLInputElement>('[aria-label="Outside"]')?.focus()
  );
  expect(document.querySelector('[role="listbox"]')).not.toBeNull();
});

it("never breaks DataList terms inside a word", () => {
  const css = readFileSync(path.join(import.meta.dirname, "data.module.css"), "utf8");
  const term = css.match(/\.dataPair dt \{([^}]*)\}/)?.[1] ?? "";
  expect(term).not.toMatch(/overflow-wrap|word-break/);
  expect(term).toContain("min-width: min-content");
});
