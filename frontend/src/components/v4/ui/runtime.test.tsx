// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { V4Scope } from "../scope";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle
} from "./alert-dialog";
import { Breadcrumb } from "./breadcrumb";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "./dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card";
import { Input } from "./input";
import { InputGroupButton, InputGroupInput } from "./input-group";
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from "./menubar";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList
} from "./navigation-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Progress } from "./progress";
import { RadioGroup, RadioGroupItem } from "./radio-group";
import { ScrollArea } from "./scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { Separator } from "./separator";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./sheet";
import { Switch } from "./switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

import menuStyles from "./menu.module.css";

let root: Root;
let host: HTMLDivElement;

const element = (selector: string) => {
  const found = document.querySelector(selector);
  if (!(found instanceof HTMLElement)) throw new Error(`Missing element ${selector}`);
  return found;
};

const render = async (children: React.ReactNode) => {
  await React.act(async () => root.render(children));
};

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
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  expect(document.querySelector("body > .v4")).toBe(null);
  vi.unstubAllGlobals();
});

describe("v4 React 18 behavior", () => {
  it("styles an active navigation link through Radix's boolean active attribute", async () => {
    await render(
      <V4Scope>
        <NavigationMenu viewport={false}>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink href="#secrets" active>
                Secrets
              </NavigationMenuLink>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <NavigationMenuLink href="#settings">Settings</NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </V4Scope>
    );
    const active = element('[data-slot="navigation-menu-link"][href="#secrets"]');
    const inactive = element('[data-slot="navigation-menu-link"][href="#settings"]');
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.hasAttribute("data-active")).toBe(true);
    expect(active.hasAttribute("data-state")).toBe(false);
    expect(inactive.hasAttribute("data-active")).toBe(false);
    expect(active.classList.contains(menuStyles.navItem)).toBe(true);
    expect(inactive.classList.contains(menuStyles.navItem)).toBe(true);
    const recipe = await readFile(path.resolve("src/components/v4/ui/menu.module.css"), "utf8");
    expect(recipe).toMatch(
      /\.navItem:is\([^)]*\[data-active\]\) \{\n {2}background-color: var\(--v4-select\);/
    );
  });

  it("forwards refs through controls and composed input controls", async () => {
    const button = React.createRef<HTMLButtonElement>();
    const input = React.createRef<HTMLInputElement>();
    const groupButton = React.createRef<HTMLButtonElement>();
    const groupInput = React.createRef<HTMLInputElement>();
    await render(
      <div>
        <Button ref={button}>Save</Button>
        <Input ref={input} aria-label="Name" />
        <InputGroupButton ref={groupButton}>Copy</InputGroupButton>
        <InputGroupInput ref={groupInput} aria-label="Path" />
      </div>
    );
    expect(button.current).toBeInstanceOf(HTMLButtonElement);
    expect(input.current).toBeInstanceOf(HTMLInputElement);
    expect(groupButton.current).toBeInstanceOf(HTMLButtonElement);
    expect(groupInput.current).toBeInstanceOf(HTMLInputElement);
    groupInput.current?.focus();
    expect(document.activeElement).toBe(groupInput.current);
  });

  it("exposes the selected Radix states and preserves vertical tab navigation", async () => {
    await render(
      <div>
        <Switch aria-label="Sync" />
        <Checkbox aria-label="Remember" defaultChecked />
        <RadioGroup defaultValue="one" aria-label="Environment">
          <RadioGroupItem value="one" aria-label="One" />
        </RadioGroup>
        <Tabs defaultValue="one" orientation="vertical">
          <TabsList aria-label="Sections">
            <TabsTrigger value="one">One</TabsTrigger>
            <TabsTrigger value="two">Two</TabsTrigger>
          </TabsList>
          <TabsContent value="one">First section</TabsContent>
          <TabsContent value="two">Second section</TabsContent>
        </Tabs>
        <Separator orientation="vertical" decorative={false} />
      </div>
    );
    const toggle = element('[role="switch"]');
    await React.act(async () => toggle.click());
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(toggle.dataset.state).toBe("checked");
    expect(element('[data-slot="switch-thumb"]').dataset.state).toBe("checked");
    expect(element('[role="checkbox"]').dataset.state).toBe("checked");
    expect(element('[role="radio"]').dataset.state).toBe("checked");
    const tab = element('[role="tab"][data-state="active"]');
    expect(tab.textContent).toBe("One");
    expect(element('[role="tablist"]').getAttribute("aria-orientation")).toBe("vertical");
    expect(element('[role="separator"]').dataset.orientation).toBe("vertical");
    await React.act(async () => {
      tab.focus();
      tab.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(document.activeElement?.textContent).toBe("Two");
    expect(element('[role="tab"][data-state="active"]').textContent).toBe("Two");
  });

  it.each([
    { value: 60, max: 100, translate: "translateX(-40%)" },
    { value: 30, max: 60, translate: "translateX(-50%)" }
  ])(
    "announces $value of $max and draws the same proportion",
    async ({ value, max, translate }) => {
      await render(<Progress value={value} max={max} aria-label="Upload" />);
      const progress = element('[role="progressbar"]');
      expect(progress.getAttribute("aria-valuenow")).toBe(String(value));
      expect(progress.getAttribute("aria-valuemax")).toBe(String(max));
      expect(progress.dataset.state).toBe("loading");
      expect(element('[data-slot="progress-indicator"]').style.transform).toBe(translate);
    }
  );

  it("keeps progress without a value indeterminate", async () => {
    await render(<Progress aria-label="Upload" />);
    expect(element('[role="progressbar"]').hasAttribute("aria-valuenow")).toBe(false);
    expect(element('[role="progressbar"]').dataset.state).toBe("indeterminate");
  });

  it("keeps popovers in a body-level scope with canonical sharp corners", async () => {
    const preview = () => (
      <V4Scope>
        <Popover defaultOpen>
          <PopoverTrigger asChild>
            <Button>Details</Button>
          </PopoverTrigger>
          <PopoverContent>Resource details</PopoverContent>
        </Popover>
      </V4Scope>
    );
    await render(preview());
    const scope = element('[data-slot="popover-content"]').closest(".v4");
    expect(scope?.parentElement).toBe(document.body);
    expect(scope?.getAttribute("data-corners")).toBe("sharp");
    expect(document.documentElement.classList.contains("v4")).toBe(false);
    expect(document.body.classList.contains("v4")).toBe(false);
    await render(preview());
    expect(
      element('[data-slot="popover-content"]').closest(".v4")?.getAttribute("data-corners")
    ).toBe("sharp");
  });

  it.each([
    {
      slot: "tooltip-content",
      render: () => (
        <TooltipProvider>
          <Tooltip defaultOpen>
            <TooltipTrigger>Help</TooltipTrigger>
            <TooltipContent>Help text</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    },
    {
      slot: "hover-card-content",
      render: () => (
        <HoverCard defaultOpen>
          <HoverCardTrigger>Details</HoverCardTrigger>
          <HoverCardContent>Details text</HoverCardContent>
        </HoverCard>
      )
    },
    {
      slot: "dropdown-menu-content",
      render: () => (
        <DropdownMenu defaultOpen>
          <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Edit</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
    {
      slot: "menubar-content",
      render: () => (
        <Menubar defaultValue="file">
          <MenubarMenu value="file">
            <MenubarTrigger>File</MenubarTrigger>
            <MenubarContent>
              <MenubarItem>Open</MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
      )
    },
    {
      slot: "select-content",
      render: () => (
        <Select defaultOpen defaultValue="dev">
          <SelectTrigger aria-label="Environment">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dev">Development</SelectItem>
          </SelectContent>
        </Select>
      )
    },
    {
      slot: "sheet-content",
      render: () => (
        <Sheet defaultOpen>
          <SheetContent>
            <SheetTitle>Edit resource</SheetTitle>
            <SheetDescription>Resource details</SheetDescription>
          </SheetContent>
        </Sheet>
      )
    },
    {
      slot: "alert-dialog-content",
      render: () => (
        <AlertDialog defaultOpen>
          <AlertDialogContent>
            <AlertDialogTitle>Delete resource?</AlertDialogTitle>
            <AlertDialogDescription>This removes the resource.</AlertDialogDescription>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogContent>
        </AlertDialog>
      )
    }
  ])("preserves the v4 scope for $slot", async ({ slot, render: preview }) => {
    await render(<V4Scope>{preview()}</V4Scope>);
    const content = element(`[data-slot="${slot}"]`);
    if (slot === "tooltip-content") {
      expect(content.dataset.state).toBe("instant-open");
      expect(content.classList.contains(menuStyles.tooltip)).toBe(true);
      expect(content.classList.contains(menuStyles.motion)).toBe(true);
    }
    const scope = content.closest(".v4");
    expect(scope?.parentElement).toBe(document.body);
    expect(scope?.getAttribute("data-corners")).toBe("sharp");
  });

  it("restores focus through an asChild dialog trigger after Escape", async () => {
    await render(
      <V4Scope>
        <Dialog>
          <DialogTrigger asChild>
            <Button>Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>Edit resource</DialogTitle>
            <DialogDescription>Change the resource name.</DialogDescription>
            <Input aria-label="Resource name" />
          </DialogContent>
        </Dialog>
      </V4Scope>
    );
    const trigger = element('[data-slot="dialog-trigger"]');
    await React.act(async () => {
      trigger.focus();
      trigger.click();
    });
    const dialog = element('[role="dialog"]');
    expect(dialog.closest(".v4")?.parentElement).toBe(document.body);
    expect(dialog.contains(document.activeElement)).toBe(true);
    await React.act(async () => {
      dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await React.act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(document.querySelector('[role="dialog"]')).toBe(null);
    expect(document.activeElement).toBe(trigger);
  });
  it("keeps a native product breadcrumb named and its text-only ancestor available", async () => {
    const path = (media?: React.ReactNode) => (
      <Breadcrumb
        variant="product"
        items={[
          { label: <strong>Workspace</strong>, href: "#workspace", media },
          {
            label: "Payments",
            menu: {
              label: "Switch project",
              options: [{ value: "payments", label: "Payments" }],
              value: "payments"
            }
          },
          { label: "Secrets" }
        ]}
      />
    );
    await render(path());
    const link = element('a[href="#workspace"]');
    const labelId = link.getAttribute("aria-labelledby");
    expect(document.getElementById(labelId ?? "")?.textContent).toBe("Workspace");
    expect(link.closest("li")?.hasAttribute("data-media")).toBe(false);
    await render(
      path(
        <svg aria-hidden="true">
          <path d="M0 0h10v10H0z" />
        </svg>
      )
    );
    expect(link.closest("li")?.hasAttribute("data-media")).toBe(true);
    expect(document.getElementById(link.getAttribute("aria-labelledby") ?? "")?.textContent).toBe(
      "Workspace"
    );
  });
  it("makes text-only scroll content keyboard reachable without trapping native arrow keys", async () => {
    await render(
      <ScrollArea>
        <div>
          {Array.from({ length: 20 }, (_, index) => (
            <p key={index}>Version {index + 1}</p>
          ))}
        </div>
      </ScrollArea>
    );
    const viewport = element('[data-slot="scroll-area-viewport"]');
    expect(viewport.tabIndex).toBe(0);
    await React.act(async () => viewport.focus());
    expect(document.activeElement).toBe(viewport);
    const event = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true
    });
    await React.act(async () => viewport.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
  });
});
