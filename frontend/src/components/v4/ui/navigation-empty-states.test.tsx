// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { CommandMenu } from "./command-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from "./context-menu";
import { Tabs } from "./tabs";

type Assert<T extends true> = T;
export type ContextMenuContentRejectsFixedSide = Assert<
  "side" extends keyof React.ComponentProps<typeof ContextMenuContent> ? false : true
>;
export type ContextMenuContentRetainsCollisionPadding = Assert<
  "collisionPadding" extends keyof React.ComponentProps<typeof ContextMenuContent> ? true : false
>;

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
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("associates every tab with a real panel, including definitions without content", async () => {
  await React.act(async () =>
    root.render(
      <Tabs
        label="Environments"
        tabs={[
          { value: "all", label: "All" },
          { value: "details", label: "Details", content: "Connection details" }
        ]}
      />
    )
  );
  const tabs = [...host.querySelectorAll('[role="tab"]')];
  expect(tabs).toHaveLength(2);
  tabs.forEach((tab) => {
    const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
    expect(panel?.getAttribute("role")).toBe("tabpanel");
    expect(panel?.getAttribute("aria-labelledby")).toBe(tab.id);
  });
});

it("keeps empty and pending messages beside the option list and restores matching commands", async () => {
  const groups = [
    {
      label: "Connections",
      items: [
        { id: "staging", label: "Staging" },
        { id: "locked", label: "Production", disabled: true }
      ]
    }
  ];
  await React.act(async () =>
    root.render(<CommandMenu inline hotkey={false} label="Search connections" groups={groups} />)
  );
  const input = host.querySelector("input");
  if (!input) throw new Error("Missing command search");
  const search = async (value: string) =>
    React.act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  await search("missing");
  expect(host.querySelector('[role="listbox"]')?.textContent).toBe("");
  expect(host.textContent).toContain('No results for "missing"');
  await search("");
  expect(host.querySelector('[role="option"][aria-selected="true"]')?.textContent).toContain(
    "Staging"
  );
  expect(host.querySelector('[role="option"][aria-disabled="true"]')?.textContent).toBe(
    "Production"
  );
  await React.act(async () =>
    root.render(
      <CommandMenu inline hotkey={false} loading label="Search connections" groups={[]} />
    )
  );
  expect(host.querySelector('[role="listbox"]')?.textContent).toBe("");
  expect(host.textContent).toContain("Searching");
});

it.each([
  ["cancelled", "F10"],
  ["cancelled", "ContextMenu"],
  ["disabled", "F10"],
  ["disabled", "ContextMenu"]
])("keeps the context menu closed when %s for %s", async (state, key) => {
  await React.act(async () =>
    root.render(
      <ContextMenu>
        <ContextMenuTrigger
          asChild
          disabled={state === "disabled"}
          onKeyDown={state === "cancelled" ? (event) => event.preventDefault() : undefined}
        >
          <button type="button">Version actions</button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Inspect version</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  );
  const trigger = host.querySelector("button");
  if (!trigger) throw new Error("Missing version actions");
  await React.act(async () =>
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        shiftKey: key === "F10",
        bubbles: true,
        cancelable: true
      })
    )
  );
  expect(document.querySelector('[role="menu"]')).toBeNull();
});

it("shows CommandMenu keyboard guidance without decorative dot separators", async () => {
  await React.act(async () =>
    root.render(
      <CommandMenu
        inline
        hotkey={false}
        label="Search connections"
        groups={[
          {
            label: "Workspace",
            items: [{ id: "connections", label: "Connections", page: "connections" }]
          }
        ]}
        pages={{
          connections: {
            title: "Connections",
            groups: [{ label: "Connections", items: [{ id: "staging", label: "Staging" }] }]
          }
        }}
      />
    )
  );
  const hints = () => {
    const footer = host.querySelector<HTMLElement>('[data-slot="command-menu-hints"]');
    if (!footer) throw new Error("Missing CommandMenu keyboard hints");
    return [...footer.children].map((hint) =>
      [
        ...[...hint.querySelectorAll('[data-slot="kbd-group"]')].map((key) =>
          key.getAttribute("aria-label")
        ),
        hint.textContent?.replace(/[↑↓↵]|Esc/g, "").trim()
      ].join(" ")
    );
  };
  expect(hints()).toEqual(["Arrow up Arrow down Navigate", "Enter Open", "Escape Close"]);
  expect(host.textContent).not.toContain("·");
  const connections = host.querySelector<HTMLElement>('[role="option"]');
  if (!connections) throw new Error("Missing Connections page option");
  await React.act(async () => connections.click());
  expect(hints()).toContain("Escape Back");
  expect(host.textContent).not.toContain("·");
});
