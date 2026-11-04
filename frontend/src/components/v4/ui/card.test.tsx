// @vitest-environment jsdom
import * as React from "react";
import { createRoot } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider
} from "@tanstack/react-router";
import { expect, it } from "vitest";

import { Button } from "./button";
import { Card, CardLink } from "./card";

it("renders one stretched anchor that leaves modifier, middle and nested clicks to the browser", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const rootRoute = createRootRoute({
    component: () => (
      <Card>
        <CardLink to={"/items/$itemId" as never} params={{ itemId: "a" } as never}>
          Item A
        </CardLink>
        <Button variant="ghost">Copy</Button>
      </Card>
    )
  });
  const itemRoute = createRoute({ getParentRoute: () => rootRoute, path: "/items/$itemId" });
  const router = createRouter({
    routeTree: rootRoute.addChildren([itemRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] })
  } as never) as unknown as {
    load: () => Promise<void>;
    state: { location: { pathname: string } };
  };
  await router.load();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await React.act(async () => root.render(<RouterProvider router={router as never} />));

  const anchors = host.querySelectorAll("a");
  expect(anchors).toHaveLength(1);
  const link = anchors[0];
  expect(link.getAttribute("href")).toBe("/items/a");
  expect(link.closest("[data-slot=card]")).not.toBeNull();
  expect(link.contains(host.querySelector("button"))).toBe(false);

  const handled: boolean[] = [];
  const settle = (event: Event) => {
    handled.push(event.defaultPrevented);
    event.preventDefault();
  };
  window.addEventListener("click", settle);
  const click = async (target: Element, init: MouseEventInit) =>
    React.act(async () => {
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
    });
  await click(link, { ctrlKey: true });
  await click(link, { metaKey: true });
  await click(link, { button: 1 });
  await click(host.querySelector("button") as HTMLButtonElement, {});
  expect(handled).toEqual([false, false, false, false]);
  expect(router.state.location.pathname).toBe("/");
  await click(link, {});
  expect(handled.at(-1)).toBe(true);
  await React.act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
  expect(router.state.location.pathname).toBe("/items/a");
  window.removeEventListener("click", settle);
  await React.act(async () => root.unmount());
  host.remove();
});
