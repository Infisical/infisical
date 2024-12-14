import { QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";

import { queryClient } from "@app/hooks/api/reactQuery";
import { ServerConfigProvider } from "@app/context";
import { TooltipProvider } from "@app/components/v2";

export const Route = createRootRoute({
  component: () => (
    <>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ServerConfigProvider>
            <Outlet />
          </ServerConfigProvider>
        </TooltipProvider>
      </QueryClientProvider>
      <TanStackRouterDevtools />
    </>
  )
});
