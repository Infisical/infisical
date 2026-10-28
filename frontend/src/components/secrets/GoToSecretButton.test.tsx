import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider
} from "@tanstack/react-router";
import assert from "node:assert/strict";
import { describe, it, vi } from "vitest";

import { GoToSecretButton } from "./GoToSecretButton";

vi.mock("@app/hooks", async () => import("@app/hooks/useToggle"));

const renderButton = async (isProjectMember: boolean) => {
  const rootRoute = createRootRoute({
    component: () => (
      <GoToSecretButton
        orgId="org-1"
        projectId="project-1"
        secretKey="API_KEY"
        secretPath="/prod"
        environmentSlug="prod"
        isProjectMember={isProjectMember}
      />
    )
  });
  const overviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/organizations/$orgId/projects/secret-management/$projectId/overview"
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([overviewRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] })
  } as never);
  await router.load();
  return renderToStaticMarkup(<RouterProvider router={router as never} />);
};

describe("GoToSecretButton", () => {
  it("renders a real link to the secret for project members", async () => {
    const markup = await renderButton(true);
    assert.ok(
      markup.includes(
        'href="/organizations/org-1/projects/secret-management/project-1/overview?secretPath=%2Fprod&amp;environments=%5B%22prod%22%5D&amp;search=API_KEY"'
      )
    );
    assert.ok(!markup.includes("<button"));
  });

  it("renders a disabled button for non-members", async () => {
    const markup = await renderButton(false);
    assert.ok(!markup.includes("<a "));
    assert.match(markup, /<button[^>]*disabled/);
  });
});
