// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { V4Scope } from "../scope";
import { AnimatedCollapse } from "./animated-collapse";
import { MultiSelect } from "./multi-select";

let host: HTMLDivElement;
let root: Root;
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
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(0), 0)
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const render = async (children: React.ReactNode) => {
  await React.act(async () => root.render(<V4Scope>{children}</V4Scope>));
};
const option = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (node) => node.textContent === name
  );
const click = async (node: HTMLElement | undefined | null) => {
  if (!node) throw new Error("Missing control");
  await React.act(async () => node.click());
};

it("mounts lazy children once and preserves their DOM and React state after exit", async () => {
  vi.useFakeTimers();
  const Counter = () => {
    const [count, setCount] = React.useState(0);
    return (
      <button type="button" onClick={() => setCount(count + 1)}>
        Draft {count}
      </button>
    );
  };
  const draw = (open: boolean) => (
    <AnimatedCollapse open={open} lazy>
      <Counter />
    </AnimatedCollapse>
  );
  await render(draw(false));
  expect(document.querySelector("button")).toBeNull();
  await render(draw(true));
  const child = document.querySelector("button");
  await click(child);
  expect(child?.textContent).toBe("Draft 1");
  await render(draw(false));
  await React.act(async () => vi.advanceTimersByTime(220));
  const collapse = document.querySelector<HTMLElement>('[data-slot="animated-collapse"]');
  expect(collapse?.hidden).toBe(true);
  expect(collapse?.getAttribute("aria-hidden")).toBe("true");
  expect(collapse?.hasAttribute("inert")).toBe(true);
  expect(document.querySelector("button")).toBe(child);
  await render(draw(true));
  expect(document.querySelector("button")).toBe(child);
  expect(child?.textContent).toBe("Draft 1");
  expect(collapse?.hidden).toBe(false);
});
it("finishes reduced-motion disclosure changes without waiting for a timer", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  await render(<AnimatedCollapse open>Content</AnimatedCollapse>);
  await render(<AnimatedCollapse open={false}>Content</AnimatedCollapse>);
  expect(document.querySelector<HTMLElement>('[data-slot="animated-collapse"]')?.hidden).toBe(true);
  await render(<AnimatedCollapse open>Content</AnimatedCollapse>);
  expect(document.querySelector('[data-slot="animated-collapse"]')?.hasAttribute("data-open")).toBe(
    true
  );
});
it("emits multi selections in option order and keeps disabled choices when unchecking", async () => {
  const changed = vi.fn();
  await render(
    <MultiSelect
      defaultOpen
      label="Roles"
      defaultValue={["locked"]}
      onChange={changed}
      options={[
        { value: "a", label: "A" },
        { value: "locked", label: "Locked", disabled: true },
        { value: "b", label: "B" }
      ]}
    />
  );
  await click(option("B"));
  await click(option("A"));
  expect(changed).toHaveBeenLastCalledWith(["a", "locked", "b"]);
  await click(option("A"));
  await click(option("B"));
  expect(changed).toHaveBeenLastCalledWith(["locked"]);
  expect(
    [...document.querySelectorAll("button")].some((node) => node.textContent === "Clear")
  ).toBe(false);
});
it("keeps a single pick when it is chosen again and ignores a disabled policy pick", async () => {
  const changed = vi.fn();
  const options = [
    { value: "a", label: "A" },
    { value: "locked", label: "Locked", disabled: true }
  ];
  await render(
    <MultiSelect
      multiple={false}
      defaultOpen
      label="Permission"
      defaultValue="a"
      options={options}
      onChange={changed}
    />
  );
  await click(option("A"));
  expect(changed).toHaveBeenLastCalledWith("a");
  expect(document.querySelector('[role="listbox"]')).toBeNull();
  changed.mockClear();
  await render(
    <MultiSelect
      multiple={false}
      open
      label="Policy permission"
      value="locked"
      options={options}
      onChange={changed}
    />
  );
  await click(option("Locked"));
  expect(changed).not.toHaveBeenCalled();
});
it("shows stable first-label/count or caller-owned all summary", async () => {
  const options = [
    { value: "a", label: "Read" },
    { value: "b", label: "Write" },
    { value: "c", label: "Rotate" }
  ];
  await render(
    <MultiSelect
      label="Permissions"
      value={["b", "a"]}
      options={options}
      allLabel="All permissions"
    />
  );
  expect(document.querySelector('[data-slot="multi-select-label"]')).toBeNull();
  expect(document.querySelector('[data-slot="multi-select-value"]')?.textContent).toBe("Read+1");
  expect(document.querySelector('[aria-label="1 more selected"]')).not.toBeNull();
  await render(
    <MultiSelect
      label="Permissions"
      value={["c", "a", "b"]}
      options={options}
      allLabel="All permissions"
    />
  );
  expect(document.querySelector('[data-slot="multi-select-value"]')?.textContent).toBe(
    "All permissions"
  );
  await render(<MultiSelect label="Permissions" size="sm" value={["a"]} options={options} />);
  expect(document.querySelector('[data-slot="multi-select-label"]')).toBeNull();
  expect(document.querySelector("button")?.getAttribute("aria-label")).toBe("Permissions");
});

it("rejects duplicate option values before exposing colliding option IDs", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const expectedError = (event: ErrorEvent) => {
    if (event.message.includes("MultiSelect option values must be unique.")) event.preventDefault();
  };
  window.addEventListener("error", expectedError);
  await expect(
    render(
      <MultiSelect
        label="Invalid options"
        options={[
          { value: "a", label: "First" },
          { value: "a", label: "Second" }
        ]}
      />
    )
  ).rejects.toThrow("MultiSelect option values must be unique.");
  window.removeEventListener("error", expectedError);
  expect(document.querySelector('[role="option"]')).toBeNull();
});

it("keeps an empty search message outside option semantics and restores matching choices", async () => {
  await render(
    <MultiSelect
      defaultOpen
      searchable
      label="Resources"
      defaultValue={["locked"]}
      options={[
        { value: "west", label: "West" },
        { value: "locked", label: "Managed", disabled: true }
      ]}
    />
  );
  const search = document.querySelector<HTMLInputElement>('[aria-label="Search Resources"]');
  if (!search) throw new Error("Missing resource search");
  const query = async (value: string) => {
    await React.act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        search,
        value
      );
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  await query("absent");
  const message = [...document.querySelectorAll("p")].find(
    (node) => node.textContent === "No options found"
  );
  expect(message).toBeDefined();
  expect(message?.closest('[role="listbox"]')).toBeNull();
  expect(document.querySelectorAll('[role="option"]')).toHaveLength(0);
  await query("");
  expect(option("West")).toBeDefined();
  expect(option("Managed")?.getAttribute("aria-selected")).toBe("true");
});
