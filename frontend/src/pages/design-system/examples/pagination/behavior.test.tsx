// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from "@app/components/v4/ui/pagination";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", function ResizeObserverMock() {
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
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
const render = async (node: React.ReactNode) => {
  await React.act(async () => root.render(node));
};

it("shows No results and no page controls for an empty total", async () => {
  await render(<Pagination total={0} label="Empty" />);
  expect(host.querySelector('[role="status"]')?.textContent).toBe("No results");
  expect(host.querySelectorAll("button")).toHaveLength(0);
});
it("hides load-more on the last page and shows the spinner while loading", async () => {
  await render(<Pagination variant="more" page={3} total={30} pageSize={10} label="Last" />);
  expect(host.querySelector("button")).toBeNull();
  expect(host.querySelector('[role="status"]')?.textContent).toBe("Showing 30 of 30");
  await render(
    <Pagination variant="more" page={1} total={30} pageSize={10} loading label="More" />
  );
  const more = host.querySelector("button");
  expect(more?.textContent).toBe("Show 10 more");
  expect(more?.getAttribute("aria-busy")).toBe("true");
  expect(more?.querySelector('[data-slot="button-progress"][data-active]')).not.toBeNull();
});
it("marks the current page without the primary material", async () => {
  await render(<Pagination total={100} pageSize={10} page={2} label="Pages" />);
  const current = host.querySelector('[aria-current="page"]');
  expect(current?.textContent).toBe("2");
  expect(current?.getAttribute("data-variant")).toBe("ghost");
  expect(host.querySelector("[data-v4-button-material]")).toBeNull();
});
it("states the compact page once", async () => {
  await render(<Pagination variant="compact" pageCount={8} defaultPage={3} label="Compact" />);
  expect(host.textContent?.match(/Page 3 of 8/g)).toHaveLength(1);
});
it("changes the active composed page and disables only the unavailable boundary", async () => {
  const Links = () => {
    const [page, setPage] = React.useState(1);
    const go = (next: number) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      setPage(next);
    };
    return (
      <Pagination aria-label="Example link pages">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#one" aria-disabled={page === 1} onClick={go(1)} />
          </PaginationItem>
          {[1, 2].map((value) => (
            <PaginationItem key={value}>
              <PaginationLink href={`#${value}`} isActive={page === value} onClick={go(value)}>
                {value}
              </PaginationLink>
            </PaginationItem>
          ))}
          <PaginationItem>
            <PaginationNext href="#two" aria-disabled={page === 2} onClick={go(2)} />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  };
  await render(<Links />);
  const second = [...host.querySelectorAll<HTMLAnchorElement>("a")].find(
    (node) => node.textContent === "2"
  );
  if (!second) throw new Error("Missing second page");
  await React.act(async () => second.click());
  expect(second.getAttribute("aria-current")).toBe("page");
  expect(host.querySelector('[aria-label="Go to next page"]')?.getAttribute("aria-disabled")).toBe(
    "true"
  );
  expect(
    host.querySelector('[aria-label="Go to previous page"]')?.getAttribute("aria-disabled")
  ).not.toBe("true");
});
