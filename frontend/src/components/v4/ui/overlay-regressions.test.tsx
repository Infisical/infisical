// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";

import { V4Scope } from "../scope";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from "./alert-dialog";
import { ContextMenu, ContextMenuTrigger } from "./context-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./dialog";
import { DropdownMenu, DropdownMenuTrigger } from "./dropdown-menu";
import { MultiStep } from "./multi-step";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetSubheader, SheetTitle } from "./sheet";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  React.act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

it("keeps menu trigger labels", async () => {
  await React.act(async () =>
    root.render(
      <V4Scope>
        <DropdownMenu>
          <DropdownMenuTrigger>Environment actions</DropdownMenuTrigger>
        </DropdownMenu>
        <ContextMenu>
          <ContextMenuTrigger>Right-click area</ContextMenuTrigger>
        </ContextMenu>
      </V4Scope>
    )
  );
  expect(host.querySelector('[data-slot="dropdown-menu-trigger"]')?.textContent).toBe(
    "Environment actions"
  );
  expect(host.querySelector('[data-slot="context-menu-trigger"]')?.textContent).toBe(
    "Right-click area"
  );
});

it.each([
  ["danger without media", { tone: "danger" as const }, false, 1],
  ["danger with media", { tone: "danger" as const }, true, 1],
  ["neutral with media", { tone: "neutral" as const }, true, 1],
  ["neutral without media", { tone: "neutral" as const }, false, 0]
])("renders at most one AlertDialog lead tile: %s", async (_, props, media, expected) => {
  await React.act(async () =>
    root.render(
      <V4Scope>
        <AlertDialog open>
          <AlertDialogContent {...props}>
            <AlertDialogHeader>
              {media && <AlertDialogMedia>A</AlertDialogMedia>}
              <AlertDialogTitle>Archive?</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction>Archive</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </V4Scope>
    )
  );
  expect(document.querySelectorAll('[data-slot="alert-dialog-media"]')).toHaveLength(expected);
});

it("scrolls the header and body together and keeps the footer and close outside", async () => {
  await React.act(async () =>
    root.render(
      <V4Scope>
        <Dialog open>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Environment history</DialogTitle>
            </DialogHeader>
            <p>Version 1</p>
            <DialogFooter showCloseButton />
          </DialogContent>
        </Dialog>
        <Sheet open>
          <SheetContent aria-describedby={undefined}>
            <SheetHeader>
              <SheetTitle>Import</SheetTitle>
            </SheetHeader>
            <SheetSubheader>acme / payments-api / production</SheetSubheader>
            <SheetBody>Keys</SheetBody>
          </SheetContent>
        </Sheet>
      </V4Scope>
    )
  );
  const scroller = document.querySelector('[data-slot="dialog-scroll"]');
  expect(scroller?.getAttribute("data-scroll-fade")).toBe("y");
  expect(scroller?.querySelector('[data-slot="dialog-header"]')).not.toBeNull();
  expect(scroller?.querySelector('[data-slot="dialog-footer"]')).toBeNull();
  expect(scroller?.querySelector('[data-slot="dialog-close"]')).toBeNull();
  expect(
    document.querySelector('[data-slot="dialog-content"] > [data-slot="dialog-footer"]')
  ).not.toBeNull();
  expect(
    document.querySelector('[data-slot="dialog-content"] > [data-slot="dialog-close"]')
  ).not.toBeNull();
  const sheetScroller = document.querySelector('[data-slot="sheet-scroll"]');
  expect(sheetScroller?.querySelector('[data-slot="sheet-body"]')).not.toBeNull();
  expect(sheetScroller?.querySelector('[data-slot="sheet-subheader"]')).toBeNull();
});

it("leaves free-form sheet content unwrapped", async () => {
  await React.act(async () =>
    root.render(
      <V4Scope>
        <Sheet open>
          <SheetContent side="left" showCloseButton={false} aria-describedby={undefined}>
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <aside>Sidebar</aside>
          </SheetContent>
        </Sheet>
      </V4Scope>
    )
  );
  const content = document.querySelector('[data-slot="sheet-content"]');
  expect(content?.querySelector('[data-slot="sheet-scroll"]')).toBeNull();
  expect(content?.querySelector(":scope > aside")).not.toBeNull();
});

it.each([
  [undefined, "sm"],
  ["md", "md"],
  ["lg", "lg"]
] as const)("sizes a sheet from a token: %s", async (size, expected) => {
  await React.act(async () =>
    root.render(
      <V4Scope>
        <Sheet open>
          <SheetContent size={size} aria-describedby={undefined}>
            <SheetTitle>New connection</SheetTitle>
          </SheetContent>
        </Sheet>
      </V4Scope>
    )
  );
  const content = document.querySelector('[data-slot="sheet-content"]');
  expect(content?.getAttribute("data-size")).toBe(expected);
  expect(content?.className).not.toMatch(/max-w-/);
});

it("caps every sheet size at its token and the viewport width", async () => {
  const css = await readFile(path.resolve("src/components/v4/ui/overlay.module.css"), "utf8");
  expect(css).toContain("--v4-sheet-size: var(--v4-size-sheet-sm);");
  expect(css).toMatch(/\.sheet\[data-size="md"\] \{\s*--v4-sheet-size: var\(--v4-size-sheet-md\);/);
  expect(css).toMatch(/\.sheet\[data-size="lg"\] \{\s*--v4-sheet-size: var\(--v4-size-sheet-lg\);/);
  expect(css).toMatch(
    /\.sheet\[data-side="left"\],\s*\.sheet\[data-side="right"\] \{\s*max-width: min\(var\(--v4-sheet-size\), 100vw\);/
  );
});

it("passes the sheet size through MultiStep", async () => {
  await React.act(async () =>
    root.render(
      <V4Scope>
        <MultiStep
          variant="sheet"
          size="lg"
          open
          title="New connection"
          steps={[{ title: "App", content: <p>Pick an app</p> }]}
        />
      </V4Scope>
    )
  );
  expect(document.querySelector('[data-slot="sheet-content"]')?.getAttribute("data-size")).toBe(
    "lg"
  );
});
