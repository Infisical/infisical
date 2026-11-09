// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { DropdownMenuItem } from "./dropdown-menu";
import {
  type RowActionList,
  RowActions,
  Table,
  TableActionsCell,
  TableBody,
  TableRow
} from "./table";
import { TooltipProvider } from "./tooltip";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

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
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const render = (node: React.ReactNode) =>
  React.act(async () =>
    root.render(
      <TooltipProvider>
        <Table>
          <TableBody>
            <TableRow>
              <TableActionsCell slots={3}>{node}</TableActionsCell>
            </TableRow>
          </TableBody>
        </Table>
      </TooltipProvider>
    )
  );

const inline: RowActionList = [
  { label: "Copy secret", icon: "copy", onSelect: vi.fn() },
  {
    label: "Edit value",
    icon: "bell",
    onSelect: vi.fn(),
    disabledReason: "Rotated secrets can't be edited"
  }
];
const menu = <DropdownMenuItem>Open secret</DropdownMenuItem>;
const radixOnly = new Set(["id", "data-state", "aria-controls", "data-v4-tooltip"]);

const shape = (element: Element): unknown => ({
  tag: element.tagName,
  attributes: Array.from(element.attributes)
    .filter(
      (attribute) =>
        !radixOnly.has(attribute.name) &&
        !(attribute.name === "data-slot" && attribute.value === "tooltip-trigger")
    )
    .map((attribute) => `${attribute.name}=${attribute.value}`)
    .sort(),
  children: Array.from(element.children).map(shape),
  text: element.children.length ? undefined : element.textContent
});

const actions = () => host.querySelector("[data-slot=table-row-actions]")!;

it.each([undefined, "Only admins can manage this secret"])(
  "renders the same DOM, classes and names while idle as once live (menu disabled reason: %s)",
  async (menuDisabledReason) => {
    await render(
      <RowActions
        label="DATABASE_URL"
        inline={inline}
        menu={menu}
        menuDisabledReason={menuDisabledReason}
      />
    );
    const live = shape(actions());
    await render(null);
    await render(
      <RowActions
        lazy
        label="DATABASE_URL"
        inline={inline}
        menu={menu}
        menuDisabledReason={menuDisabledReason}
      />
    );
    expect(actions().querySelector("[data-state]")).toBeNull();
    expect(shape(actions())).toEqual(live);
  }
);

it("swaps in the real parts on focus and keeps focus on the same button", async () => {
  await render(<RowActions lazy label="DATABASE_URL" inline={inline} menu={menu} />);
  const idleMore = host.querySelector<HTMLButtonElement>("[aria-haspopup=menu]")!;
  await React.act(async () => idleMore.focus());
  const more = host.querySelector<HTMLButtonElement>("[aria-haspopup=menu]")!;
  expect(more).not.toBe(idleMore);
  expect(more.getAttribute("data-state")).toBe("closed");
  expect(document.activeElement).toBe(more);
});

it("opens the More menu on the first press while idle", async () => {
  const onOpenChange = vi.fn();
  await render(
    <RowActions lazy label="DATABASE_URL" inline={inline} menu={menu} onOpenChange={onOpenChange} />
  );
  const idleMore = host.querySelector<HTMLButtonElement>("[aria-haspopup=menu]")!;
  await React.act(async () => {
    idleMore.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 })
    );
  });
  expect(onOpenChange).toHaveBeenCalledWith(true);
  expect(document.querySelector("[role=menu]")?.textContent).toContain("Open secret");
  expect(host.querySelector("[aria-haspopup=menu]")?.getAttribute("aria-expanded")).toBe("true");
});

it("runs an inline action pressed while idle, and never a blocked one", async () => {
  const copy = vi.fn();
  const edit = vi.fn();
  await render(
    <RowActions
      lazy
      label="DATABASE_URL"
      inline={[
        { label: "Copy secret", icon: "copy", onSelect: copy },
        { label: "Edit value", icon: "bell", onSelect: edit, disabledReason: "Blocked" }
      ]}
    />
  );
  const [idleCopy, idleEdit] = Array.from(host.querySelectorAll("button"));
  await React.act(async () => idleEdit.click());
  expect(edit).not.toHaveBeenCalled();
  await render(null);
  await render(
    <RowActions
      lazy
      label="DATABASE_URL"
      inline={[{ label: "Copy secret", icon: "copy", onSelect: copy }]}
    />
  );
  await React.act(async () => host.querySelector("button")!.click());
  expect(copy).toHaveBeenCalledTimes(1);
  expect(idleCopy.isConnected).toBe(false);
});

it("opens the More menu from outside through open, idle or not", async () => {
  const Controlled = () => {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <button type="button" data-testid="outside" onClick={() => setOpen(true)}>
          Open menu
        </button>
        <RowActions lazy label="DATABASE_URL" menu={menu} open={open} onOpenChange={setOpen} />
      </>
    );
  };
  await render(<Controlled />);
  expect(document.querySelector("[role=menu]")).toBeNull();
  await React.act(async () =>
    host.querySelector<HTMLButtonElement>("[data-testid=outside]")!.click()
  );
  expect(document.querySelector("[role=menu]")?.textContent).toContain("Open secret");
});
