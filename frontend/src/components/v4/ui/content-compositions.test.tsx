// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { V4Scope } from "../scope";
import { Breadcrumb } from "./breadcrumb";
import { CommandMenu } from "./command-menu";
import { Item, ItemGroup, Media, Tile } from "./item";

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
const render = async (children: React.ReactNode) => {
  await React.act(async () => root.render(<V4Scope>{children}</V4Scope>));
};
const query = async (value: string) => {
  await React.act(async () => {
    const input = document.querySelector("input");
    if (!input) throw new Error("Missing input");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const clickText = async (value: string) => {
  const target = [...document.querySelectorAll<HTMLElement>("[cmdk-item],button")].find(
    (node) => node.textContent === value
  );
  if (!target) throw new Error(`Missing ${value}`);
  await React.act(async () => target.click());
};

describe("content compositions", () => {
  it("expands breadcrumb middle levels without losing the focused disclosure", async () => {
    await render(
      <Breadcrumb
        maxItems={3}
        items={[
          { label: "Workspace", href: "#workspace" },
          { label: "Project", href: "#project" },
          { label: "Environment", href: "#environment" },
          { label: "Folder", href: "#folder" },
          { label: "Secret" }
        ]}
      />
    );
    expect(document.querySelectorAll("nav a")).toHaveLength(1);
    const button = document.querySelector("button");
    await React.act(async () => button?.focus());
    await React.act(async () => button?.click());
    expect(document.querySelectorAll("nav a")).toHaveLength(4);
    expect(document.activeElement).toBe(button);
    expect(button?.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector('[aria-current="page"]')?.textContent).toBe("Secret");
  });
  it("keeps Item list semantics around slotted links and supports object/action slots", async () => {
    await render(
      <ItemGroup>
        <Item
          title="service_api_key"
          mono
          media={<Media icon="key" />}
          description="Used by the deployment service"
          meta="2 hours ago"
          unread
          actions={<button type="button">Rotate</button>}
          actionsPlacement="below"
        />
        <Item asChild>
          <a href="#details">Open details</a>
        </Item>
      </ItemGroup>
    );
    expect(document.querySelectorAll('[role="listitem"]')).toHaveLength(2);
    expect(document.querySelector('[role="listitem"] > a')?.getAttribute("href")).toBe("#details");
    expect(host.textContent).toContain("Unread");
    expect(host.textContent).toContain("Used by the deployment service");
    await render(
      <Tile
        title="Secrets"
        description="Store and rotate credentials"
        selected={false}
        media={<Media icon="key" />}
      />
    );
    expect(document.querySelector("button")?.getAttribute("aria-pressed")).toBe("false");
    expect(host.textContent).toContain("Store and rotate credentials");
  });
  it("ranks command labels, marks matches, and hides query-only groups until searching", async () => {
    await render(
      <CommandMenu
        inline
        hotkey={false}
        groups={[
          {
            label: "Pages",
            items: [
              { id: "suffix", label: "Project secrets" },
              { id: "start", label: "Secrets" }
            ]
          },
          {
            label: "Objects",
            searchOnly: true,
            items: [{ id: "object", label: "secrets_api_key" }]
          }
        ]}
      />
    );
    expect(document.body.textContent).not.toContain("secrets_api_key");
    await query("secrets");
    expect(
      [...document.querySelectorAll("[cmdk-item]")].map((node) => node.textContent?.trim())
    ).toEqual(["Secrets", "Project secrets", "secrets_api_key"]);
    expect(document.querySelectorAll("mark")).toHaveLength(3);
  });
  it("returns from a command page on Escape before closing its Dialog", async () => {
    await render(
      <CommandMenu
        defaultOpen
        hotkey={false}
        groups={[
          {
            label: "Workspace",
            items: [{ id: "switch", label: "Switch project", page: "projects" }]
          }
        ]}
        pages={{
          projects: {
            title: "Projects",
            groups: [{ label: "Projects", items: [{ id: "prod", label: "Production" }] }]
          }
        }}
      />
    );
    await clickText("Switch project");
    expect(document.querySelector<HTMLInputElement>("input")?.getAttribute("aria-label")).toBe(
      "Projects"
    );
    await React.act(async () => {
      document
        .querySelector("input")
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
        );
    });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector<HTMLInputElement>("input")?.getAttribute("aria-label")).toBe(
      "Search workspace"
    );
    await React.act(async () => {
      document
        .querySelector("input")
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
        );
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("opens link commands with Mod+Enter without also activating their action", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const action = vi.fn();
    await render(
      <CommandMenu
        inline
        hotkey={false}
        groups={[
          {
            label: "Links",
            items: [
              {
                id: "docs",
                label: "Documentation",
                href: "https://example.com/docs",
                onSelect: action
              }
            ]
          }
        ]}
      />
    );
    await React.act(async () =>
      document.querySelector("input")?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          ctrlKey: true,
          bubbles: true,
          cancelable: true
        })
      )
    );
    expect(open).toHaveBeenCalledWith("https://example.com/docs", "_blank", "noopener,noreferrer");
    expect(action).not.toHaveBeenCalled();
    open.mockRestore();
  });
  it("keeps failed commands retryable and suppresses obsolete asynchronous failures", async () => {
    let reject: (error: Error) => void = () => {};
    const action = vi.fn(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        })
    );
    await render(
      <CommandMenu
        inline
        hotkey={false}
        groups={[
          { label: "Actions", items: [{ id: "rotate", label: "Rotate token", onSelect: action }] }
        ]}
      />
    );
    await clickText("Rotate token");
    await query("rotate");
    await React.act(async () => reject(new Error("offline")));
    expect(document.querySelector('[role="alert"]')).toBeNull();
    await clickText("Rotate token");
    await React.act(async () => reject(new Error("offline")));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Try again");
    expect(action).toHaveBeenCalledTimes(2);
  });
  it("guards an asynchronous action against rapid pointer and keyboard activation", async () => {
    let finish: () => void = () => {};
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    await render(
      <CommandMenu
        inline
        hotkey={false}
        groups={[
          {
            label: "Actions",
            items: [{ id: "rotate", label: "Rotate token", onSelect: action, keepOpen: true }]
          }
        ]}
      />
    );
    const row = document.querySelector<HTMLElement>("[cmdk-item]");
    const input = document.querySelector("input");
    await React.act(async () => {
      row?.click();
      input?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
      );
      row?.click();
    });
    expect(action).toHaveBeenCalledTimes(1);
    expect(row?.getAttribute("aria-busy")).toBe("true");
    expect(row?.getAttribute("aria-disabled")).toBe("true");
    await React.act(async () => finish());
    expect(row?.getAttribute("aria-disabled")).toBe("false");
    await clickText("Rotate token");
    expect(action).toHaveBeenCalledTimes(2);
    await React.act(async () => finish());
  });
  it("resets nested query and page after an externally controlled close", async () => {
    const changed = vi.fn();
    const menu = (open: boolean) => (
      <CommandMenu
        open={open}
        hotkey={false}
        onQueryChange={changed}
        groups={[
          {
            label: "Workspace",
            items: [{ id: "switch", label: "Switch project", page: "projects" }]
          }
        ]}
        pages={{
          projects: {
            title: "Projects",
            groups: [{ label: "Projects", items: [{ id: "prod", label: "Production" }] }]
          }
        }}
      />
    );
    await render(menu(true));
    await clickText("Switch project");
    await query("prod");
    await render(menu(false));
    expect(changed).toHaveBeenLastCalledWith("", undefined);
    await render(menu(true));
    const input = document.querySelector<HTMLInputElement>("input");
    expect(input?.value).toBe("");
    expect(input?.getAttribute("aria-label")).toBe("Search workspace");
    expect(document.querySelector("[cmdk-item]")?.textContent).toContain("Switch project");
  });
  it("starts at root after both hotkey dismissal and successful action dismissal", async () => {
    const changed = vi.fn();
    const action = vi.fn();
    await render(
      <CommandMenu
        defaultOpen
        onQueryChange={changed}
        groups={[
          {
            label: "Workspace",
            items: [{ id: "switch", label: "Switch project", page: "projects" }]
          }
        ]}
        pages={{
          projects: {
            title: "Projects",
            groups: [
              { label: "Projects", items: [{ id: "prod", label: "Production", onSelect: action }] }
            ]
          }
        }}
      />
    );
    const toggle = async () => {
      await React.act(async () => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true })
        );
      });
    };
    await clickText("Switch project");
    await query("prod");
    await toggle();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(changed).toHaveBeenLastCalledWith("", undefined);
    await toggle();
    expect(document.querySelector<HTMLInputElement>("input")?.value).toBe("");
    expect(document.querySelector("input")?.getAttribute("aria-label")).toBe("Search workspace");
    await clickText("Switch project");
    await query("prod");
    await clickText("Production");
    expect(action).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(changed).toHaveBeenLastCalledWith("", undefined);
    await toggle();
    expect(document.querySelector<HTMLInputElement>("input")?.value).toBe("");
    expect(document.querySelector("input")?.getAttribute("aria-label")).toBe("Search workspace");
  });
  it("blocks the link shortcut while that command action is pending", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    let reject: (cause: Error) => void = () => {};
    const action = vi.fn(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        })
    );
    await render(
      <CommandMenu
        inline
        hotkey={false}
        groups={[
          {
            label: "Links",
            items: [
              {
                id: "docs",
                label: "Documentation",
                href: "https://example.com/docs",
                onSelect: action
              }
            ]
          }
        ]}
      />
    );
    await clickText("Documentation");
    expect(document.querySelector("[cmdk-item]")?.getAttribute("aria-disabled")).toBe("true");
    const shortcut = new KeyboardEvent("keydown", {
      key: "Enter",
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    await React.act(async () => document.querySelector("input")?.dispatchEvent(shortcut));
    expect(shortcut.defaultPrevented).toBe(true);
    expect(open).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledTimes(1);
    await React.act(async () => reject(new DOMException("Cancelled", "AbortError")));
    open.mockRestore();
  });
  it("keeps switching purpose and complex context in the name when crumb labels collapse", async () => {
    await render(
      <Breadcrumb
        variant="product"
        items={[
          {
            label: (
              <span>
                Payments <strong>production</strong>
              </span>
            ),
            media: <svg role="img" aria-label="Decorative provider" />,
            menu: {
              label: "Switch project",
              options: [{ value: "payments", label: "Payments" }],
              value: "payments"
            }
          },
          {
            label: "Staging",
            menu: {
              label: "Switch environment",
              options: [{ value: "staging", label: "Staging" }],
              value: "staging"
            }
          }
        ]}
      />
    );
    const trigger = document.querySelector("nav button");
    expect(trigger?.getAttribute("aria-label")).toBe("Switch project");
    const references = trigger
      ?.getAttribute("aria-labelledby")
      ?.split(" ")
      .map((id) => document.getElementById(id));
    expect(references).toHaveLength(2);
    expect(references?.map((node) => node?.textContent)).toEqual([
      "Switch project",
      "Payments production"
    ]);
    expect(references?.every((node) => node && trigger?.contains(node))).toBe(true);
    const context = references?.[1];
    if (context) context.style.display = "none";
    expect(trigger?.getAttribute("aria-labelledby")).toContain(context?.id);
    expect(trigger?.getAttribute("aria-label")).not.toContain("Decorative provider");
  });
});
