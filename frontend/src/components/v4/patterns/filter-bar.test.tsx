// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

import { V4Scope } from "../scope";
import { FilterBar, type FilterBarFilter } from "./filter-bar";

it("moves focus to the remaining chip when a chip is removed", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();

      unobserve = vi.fn();

      disconnect = vi.fn();
    }
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const options = [{ value: "a", label: "A" }];
  const Harness = () => {
    const [value, setValue] = React.useState<FilterBarFilter[]>([
      { field: "one", values: ["a"] },
      { field: "two", values: ["a"] }
    ]);
    return (
      <V4Scope>
        <FilterBar
          label="Filters"
          fields={[
            { key: "one", label: "One", type: "select", options },
            { key: "two", label: "Two", type: "select", options }
          ]}
          value={value}
          onChange={setValue}
        />
      </V4Scope>
    );
  };
  await React.act(async () => root.render(<Harness />));
  const remove = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Remove One filter"
  );
  expect(remove).toBeDefined();
  await React.act(async () => remove?.click());
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Two is A");
  expect(document.querySelectorAll('[aria-label="Applied filters"] > li')).toHaveLength(1);
  await React.act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
