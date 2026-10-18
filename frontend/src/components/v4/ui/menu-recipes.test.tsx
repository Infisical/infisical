// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { V4Scope } from "../scope";
import { Command, CommandGroup, CommandItem, CommandList } from "./command";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from "./context-menu";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "./dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card";
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from "./menubar";
import { MultiSelect } from "./multi-select";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger
} from "./navigation-menu";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "./popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { Tooltip, TooltipProvider } from "./tooltip";

import menu from "./menu.module.css";

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
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
    configurable: true,
    value: vi.fn(() => false)
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
});
const render = async (children: React.ReactNode) => {
  await React.act(async () => root.render(<V4Scope>{children}</V4Scope>));
};
const all = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
const one = (selector: string) => {
  const node = document.querySelector<HTMLElement>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
};
const classes = (node: HTMLElement) => [...node.classList];

const menuPanels = [
  {
    name: "dropdown menu",
    slots: ["dropdown-menu-content", "dropdown-menu-sub-content"],
    rows: '[role="menuitem"], [role="menuitemcheckbox"]',
    render: () => (
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Rename</DropdownMenuItem>
          <DropdownMenuCheckboxItem checked>Show archived</DropdownMenuCheckboxItem>
          <DropdownMenuSub open>
            <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem>Production</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  },
  {
    name: "menubar",
    slots: ["menubar-content"],
    rows: '[data-slot="menubar-content"] [role="menuitem"]',
    render: () => (
      <Menubar defaultValue="file">
        <MenubarMenu value="file">
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>Rename</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    )
  },
  {
    name: "select",
    slots: ["select-content"],
    rows: '[role="option"]',
    render: () => (
      <Select defaultOpen defaultValue="dev">
        <SelectTrigger aria-label="Environment">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="dev">Development</SelectItem>
          <SelectItem value="prod">Production</SelectItem>
        </SelectContent>
      </Select>
    )
  },
  {
    name: "multi-select",
    slots: ["popover-content"],
    rows: '[role="option"]',
    render: () => (
      <MultiSelect
        label="Roles"
        defaultOpen
        options={[
          { value: "read", label: "Read" },
          { value: "write", label: "Write" }
        ]}
      />
    )
  },
  {
    name: "command list in a popover",
    slots: ["popover-content"],
    rows: '[data-slot="command-item"]',
    render: () => (
      <Popover defaultOpen>
        <PopoverTrigger>Open</PopoverTrigger>
        <PopoverContent surface="menu">
          <Command>
            <CommandList>
              <CommandGroup heading="Environments">
                <CommandItem>Development</CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    )
  }
] as const;

describe("shared menu recipes", () => {
  it("exposes named recipe classes", () => {
    ["surface", "panel", "inset", "motion", "row", "card", "tooltip"].forEach((name) => {
      expect(menu[name], name).toEqual(expect.any(String));
      expect(menu[name].length, name).toBeGreaterThan(0);
    });
  });

  it.each(menuPanels)(
    "gives every $name panel the shared surface, sizing and motion",
    async (panel) => {
      await render(panel.render());
      panel.slots.forEach((slot) => {
        const content = one(`[data-slot="${slot}"]`);
        expect(classes(content), slot).toEqual(
          expect.arrayContaining([menu.surface, menu.panel, menu.motion])
        );
      });
      const rows = all(panel.rows);
      expect(rows.length).toBeGreaterThan(0);
      rows.forEach((row) => expect(classes(row)).toContain(menu.row));
      const rowContainer = rows[0].closest(`.${menu.inset}`);
      expect(rowContainer).not.toBeNull();
    }
  );

  it("gives context menu content the shared panel and rows", async () => {
    await render(
      <ContextMenu>
        <ContextMenuTrigger>Target</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Rename</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
    await React.act(async () => {
      one('[data-slot="context-menu-trigger"]').dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 1, clientY: 1 })
      );
    });
    expect(classes(one('[data-slot="context-menu-content"]'))).toEqual(
      expect.arrayContaining([menu.surface, menu.panel, menu.inset, menu.motion])
    );
    expect(classes(one('[role="menuitem"]'))).toContain(menu.row);
  });

  it("puts navigation menu content links on the shared row inside a shared panel", async () => {
    await render(
      <NavigationMenu viewport={false} defaultValue="resources">
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuLink href="#overview">Overview</NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem value="resources">
            <NavigationMenuTrigger>Resources</NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuLink href="#secrets">Secrets</NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    );
    expect(classes(one('[data-slot="navigation-menu-content"]'))).toEqual(
      expect.arrayContaining([menu.surface, menu.panel, menu.inset, menu.motion])
    );
    expect(classes(one('a[href="#secrets"]'))).toContain(menu.row);
    expect(classes(one('a[href="#overview"]'))).toContain(menu.navItem);
    expect(classes(one('[data-slot="navigation-menu-trigger"]'))).toContain(menu.navItem);
  });

  it("gives popover, hover card and tooltip the shared surface and motion", async () => {
    await render(
      <TooltipProvider>
        <Popover defaultOpen>
          <PopoverTrigger>Popover</PopoverTrigger>
          <PopoverContent>Body</PopoverContent>
        </Popover>
        <HoverCard defaultOpen>
          <HoverCardTrigger>Hover</HoverCardTrigger>
          <HoverCardContent>Card</HoverCardContent>
        </HoverCard>
        <Tooltip defaultOpen content="Tip">
          <button type="button">Tip trigger</button>
        </Tooltip>
      </TooltipProvider>
    );
    ["popover-content", "hover-card-content"].forEach((slot) =>
      expect(classes(one(`[data-slot="${slot}"]`)), slot).toEqual(
        expect.arrayContaining([menu.surface, menu.card, menu.motion])
      )
    );
    expect(classes(one('[data-slot="tooltip-content"]'))).toEqual(
      expect.arrayContaining([menu.tooltip, menu.motion])
    );
  });

  it("mounts an asChild PopoverAnchor child once and keeps the caller's ref on it", async () => {
    const mounts = vi.fn();
    const Destination = React.forwardRef<HTMLParagraphElement, React.ComponentProps<"p">>(
      (props, ref) => {
        React.useEffect(() => mounts(), []);
        return <p ref={ref} {...props} />;
      }
    );
    const anchor = React.createRef<HTMLParagraphElement>();
    const Example = ({ open }: { open: boolean }) => (
      <Popover open={open}>
        <PopoverAnchor asChild ref={anchor}>
          <Destination>Destination: vault.example.test</Destination>
        </PopoverAnchor>
        <PopoverTrigger>Edit destination</PopoverTrigger>
        <PopoverContent>Hostname</PopoverContent>
      </Popover>
    );
    await render(<Example open={false} />);
    await render(<Example open />);
    await render(<Example open={false} />);
    expect(mounts).toHaveBeenCalledTimes(1);
    expect(anchor.current?.isConnected).toBe(true);
    expect(anchor.current?.dataset.slot).toBe("popover-anchor");
    expect(anchor.current?.textContent).toBe("Destination: vault.example.test");
  });

  it("has no Clear footer and shows search only when searchable is set", async () => {
    const options = [
      { value: "read", label: "Read" },
      { value: "write", label: "Write" }
    ];
    await render(
      <MultiSelect label="Roles" defaultOpen defaultValue={["read"]} options={options} />
    );
    expect(document.querySelector('[data-slot="multi-select-footer"]')).toBeNull();
    expect(document.querySelector('[data-slot="multi-select-search"]')).toBeNull();
    await render(
      <MultiSelect label="Roles" open searchable defaultValue={["read"]} options={options} />
    );
    expect(document.querySelector('[data-slot="multi-select-search"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="multi-select-footer"]')).toBeNull();
  });

  it("draws check and radio indicators at the end of the row, ahead of any shortcut", async () => {
    await render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuCheckboxItem checked>Show archived</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
    const row = one('[role="menuitemcheckbox"]');
    const indicator = row.querySelector<HTMLElement>(`.${menu.indicator}`);
    expect(indicator).not.toBeNull();
    expect(indicator?.dataset.slot).toBe("dropdown-menu-checkbox-item-indicator");
  });

  it("reserves the left icon column only through the shared recipe", () => {
    const css = readFileSync(resolve(__dirname, "menu.module.css"), "utf8");
    expect(css).not.toContain("indicator-slot");
    expect(css).toMatch(/\.indicator \{[^}]*margin-inline-start: auto/);
    expect(css).toMatch(/\.inset:has\([^)]*\.row > :is\(svg/);
  });
});
