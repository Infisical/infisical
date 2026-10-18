// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Kbd, KbdGroup, shortcutSteps } from "./kbd";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  paginationPages,
  PaginationPrevious
} from "./pagination";

let root: Root;
let host: HTMLDivElement;
const render = async (node: React.ReactNode) => {
  await React.act(async () => root.render(node));
};
const element = (selector: string): HTMLElement => {
  const found = host.querySelector(selector);
  if (!(found instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
  return found;
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("keyboard hints", () => {
  it("parses platform modifiers, sequences and a literal plus key", async () => {
    expect(shortcutSteps("⌘⇧P")).toEqual([["⌘", "⇧", "P"]]);
    expect(shortcutSteps("Ctrl++")).toEqual([["Ctrl", "+"]]);
    expect(shortcutSteps("G then S")).toEqual([["G"], ["S"]]);
    await render(<Kbd keys="mod+shift+P" platform="mac" />);
    expect(element('[role="group"]').getAttribute("aria-label")).toBe("Command Shift P");
    expect(host.textContent).toBe("⌘⇧P");
    await render(<Kbd keys={[["mod", "K"], ["G"]]} platform="other" />);
    expect(element('[role="group"]').getAttribute("aria-label")).toBe("Control K then G");
    expect(host.textContent).toContain("CtrlKthenG");
  });
  it("forwards real native Kbd and KbdGroup refs", async () => {
    const cap = React.createRef<HTMLElement>();
    const group = React.createRef<HTMLElement>();
    await render(
      <KbdGroup ref={group}>
        <Kbd ref={cap}>Esc</Kbd>
      </KbdGroup>
    );
    expect(cap.current?.tagName).toBe("KBD");
    expect(group.current?.tagName).toBe("SPAN");
  });
});
describe("pagination", () => {
  it("shows exact ranges and reports bounded page and page-size actions", async () => {
    const change = vi.fn();
    const size = vi.fn();
    await render(
      <Pagination
        page={2}
        total={412}
        pageSize={25}
        pageSizeOptions={[10, 25, 50]}
        onPageChange={change}
        onPageSizeChange={size}
      />
    );
    expect(host.textContent).toContain("26–50 of 412");
    await React.act(async () => element('[aria-label="Go to next page"]').click());
    expect(change).toHaveBeenLastCalledWith(3);
    const trigger = element('[data-slot="select-trigger"]');
    expect(host.querySelector(`label[for="${trigger.id}"]`)?.textContent).toBe("Rows per page");
    expect(trigger.textContent).toBe("25");
    Element.prototype.scrollIntoView = vi.fn();
    await React.act(async () => {
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (node) => node.textContent === "50"
    );
    if (!option) throw new Error("Missing page size option");
    await React.act(async () => {
      option.focus();
      option.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(size).toHaveBeenCalledWith(50);
    expect(change).toHaveBeenLastCalledWith(1);
    await render(<Pagination total={0} onPageChange={change} />);
    expect(host.textContent).toBe("No results");
    expect(host.querySelector("button")).toBeNull();
  });
  it("supports compact and manual-more states without fetching automatically", async () => {
    expect(paginationPages(8, 17)).toEqual([1, "gap", 7, 8, 9, "gap", 17]);
    await render(<Pagination variant="compact" page={17} pageCount={17} />);
    expect(host.textContent).toContain("Page 17 of 17");
    expect(element('[aria-label="Go to next page"]')).toHaveProperty("disabled", true);
    const more = vi.fn();
    await render(<Pagination variant="more" page={1} total={60} pageSize={25} onLoadMore={more} />);
    expect(more).not.toHaveBeenCalled();
    await React.act(async () => element("button").click());
    expect(more).toHaveBeenCalledOnce();
    await render(
      <Pagination variant="more" page={1} total={60} pageSize={25} onLoadMore={more} loading />
    );
    expect(element("button").getAttribute("aria-busy")).toBe("true");
    await React.act(async () => element("button").click());
    expect(more).toHaveBeenCalledOnce();
  });
  it("forwards actual anchor refs through composed links and disables unavailable navigation", async () => {
    const link = React.createRef<HTMLAnchorElement>();
    const previous = React.createRef<HTMLAnchorElement>();
    const next = React.createRef<HTMLAnchorElement>();
    const click = vi.fn();
    await render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious ref={previous} href="#previous" />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink ref={link} href="#current" isActive>
              1
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext ref={next} href="#next" aria-disabled onClick={click} />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
    expect(link.current?.tagName).toBe("A");
    expect(previous.current?.tagName).toBe("A");
    expect(next.current?.tagName).toBe("A");
    expect(link.current?.getAttribute("aria-current")).toBe("page");
    expect(next.current?.hasAttribute("href")).toBe(false);
    expect(next.current?.getAttribute("role")).toBe("link");
    expect(next.current?.tabIndex).toBe(-1);
    await React.act(async () => next.current?.click());
    expect(click).not.toHaveBeenCalled();
  });
});
