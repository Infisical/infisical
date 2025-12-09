import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

import { NotificationContainer } from "@app/components/notifications";
import { TooltipProvider } from "@app/components/v2";
import { adminQueryKeys, fetchServerConfig } from "@app/hooks/api/admin/queries";
import { TServerConfig } from "@app/hooks/api/admin/types";
import { queryClient } from "@app/hooks/api/reactQuery";

type TRouterContext = {
  serverConfig: TServerConfig | null;
  queryClient: QueryClient;
};

const RootPage = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Outlet />
        <NotificationContainer />
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export const Route = createRootRouteWithContext<TRouterContext>()({
  component: RootPage,
  beforeLoad: async ({ context }) => {
    const serverConfig = await context.queryClient.ensureQueryData({
      queryKey: adminQueryKeys.serverConfig(),
      queryFn: fetchServerConfig
    });
    return { serverConfig };
  }
});
