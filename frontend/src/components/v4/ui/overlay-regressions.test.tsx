// @vitest-environment jsdom
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
import { DropdownMenu, DropdownMenuTrigger } from "./dropdown-menu";
import { Menubar, MenubarMenu, MenubarTrigger } from "./menubar";

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
        <Menubar>
          <MenubarMenu>
            <MenubarTrigger>Environment</MenubarTrigger>
          </MenubarMenu>
        </Menubar>
        <DropdownMenu>
          <DropdownMenuTrigger>Environment actions</DropdownMenuTrigger>
        </DropdownMenu>
        <ContextMenu>
          <ContextMenuTrigger>Right-click area</ContextMenuTrigger>
        </ContextMenu>
      </V4Scope>
    )
  );
  expect(host.querySelector('[data-slot="menubar-trigger"]')?.textContent).toBe("Environment");
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
