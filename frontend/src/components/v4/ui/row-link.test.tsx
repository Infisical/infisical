import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider
} from "@tanstack/react-router";
import { expect, it } from "vitest";

import { RowLink } from "./row-link";

it("renders a typed href with a stretched target, and a span with no href when disabled", async () => {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <RowLink to={"/items/$itemId" as never} params={{ itemId: "a" } as never}>
          Item A
        </RowLink>
        <RowLink to={"/items/$itemId" as never} params={{ itemId: "b" } as never} disabled>
          Item B
        </RowLink>
      </>
    )
  });
  const itemRoute = createRoute({ getParentRoute: () => rootRoute, path: "/items/$itemId" });
  const router = createRouter({
    routeTree: rootRoute.addChildren([itemRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] })
  } as never);
  await router.load();
  const markup = renderToStaticMarkup(<RouterProvider router={router as never} />);
  expect(markup).toMatch(/<a [^>]*data-row-link=""[^>]*href="\/items\/a"[^>]*>Item A<\/a>/);
  expect(markup).toMatch(/<span role="link" aria-disabled="true"[^>]*>Item B<\/span>/);
});
