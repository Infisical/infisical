import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet, useRouterState } from "@tanstack/react-router";

import { NotificationContainer } from "@app/components/notifications";
import { TooltipProvider } from "@app/components/v2";
import {
  RootCommandMenu,
  type RootCommandMenuShell
} from "@app/components/v3/platform/RootCommandMenu";
import { ThemeProvider } from "@app/components/v3/platform/ThemeProvider";
import { adminQueryKeys, fetchServerConfig } from "@app/hooks/api/admin/queries";
import { TServerConfig } from "@app/hooks/api/admin/types";
import { authKeys } from "@app/hooks/api/auth/queries";
import { fetchAuthToken, shouldRetryAuthTokenFetch } from "@app/hooks/api/auth/refresh";
import { queryClient } from "@app/hooks/api/reactQuery";

type TRouterContext = {
  serverConfig: TServerConfig | null;
  queryClient: QueryClient;
};

const RootCommandMenuMount = () => {
  const shell = useRouterState({
    select: (state): RootCommandMenuShell | null => {
      const routeIds = new Set(state.matches.map((match) => match.routeId));

      if (routeIds.has("/_authenticate/_inject-org-details/admin/_admin-layout")) {
        return "admin";
      }
      if (routeIds.has("/_authenticate/_inject-org-details/_org-layout")) {
        return "organization";
      }
      if (routeIds.has("/_authenticate/personal-settings/_layout")) {
        return "personal-settings";
      }
      return null;
    }
  });

  if (!shell) return null;

  return <RootCommandMenu shell={shell} />;
};

const RootPage = () => {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Outlet />
          <RootCommandMenuMount />
          <NotificationContainer />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export const Route = createRootRouteWithContext<TRouterContext>()({
  component: RootPage,
  beforeLoad: async ({ context }) => {
    const authToken = await context.queryClient
      .fetchQuery({
        queryKey: authKeys.getAuthToken,
        queryFn: fetchAuthToken,
        staleTime: Infinity,
        retry: shouldRetryAuthTokenFetch
      })
      .catch(() => {
        // No valid refresh cookie — boot continues unauthenticated.
        // Downstream middlewares handle redirects for protected routes.
        return null;
      });

    const serverConfig = await context.queryClient.ensureQueryData({
      queryKey: adminQueryKeys.serverConfig(),
      queryFn: fetchServerConfig
    });
    return { authToken, serverConfig };
  }
});
