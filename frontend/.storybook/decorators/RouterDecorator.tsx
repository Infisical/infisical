import { useMemo } from "react";
import type { Decorator } from "@storybook/react-vite";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";

export const RouterDecorator: Decorator = (Story, params) => {
  const router = useMemo(() => {
    const routeTree = createRootRoute({
      component: Story
    });

    return createRouter({
      routeTree
    });
  }, [Story, params]);

  return <RouterProvider router={router as any} />;
};
