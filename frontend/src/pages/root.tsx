import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";

import { ChatWidget } from "@app/components/features/chat-widget";
import { NotificationContainer } from "@app/components/notifications";
import { TooltipProvider } from "@app/components/v2";
import { adminQueryKeys, fetchServerConfig } from "@app/hooks/api/admin/queries";
import { TServerConfig } from "@app/hooks/api/admin/types";
import { queryClient } from "@app/hooks/api/reactQuery";
import {
  useChatWidgetActions,
  useChatWidgetContent,
  useChatWidgetState
} from "@app/hooks/ui/chat-widget";

type TRouterContext = {
  serverConfig: TServerConfig | null;
  queryClient: QueryClient;
};

const ChatWidgetContainer = () => {
  const { data: state } = useChatWidgetState();
  const { data: cachedContent } = useChatWidgetContent(state?.documentationUrl);
  const { setOpen } = useChatWidgetActions();

  return (
    <ChatWidget
      documentationUrl={state?.documentationUrl}
      documentationContent={cachedContent || undefined}
      isOpen={state?.isOpen ?? false}
      onToggle={setOpen}
    />
  );
};

const RootPage = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Outlet />
        <NotificationContainer />
        <ChatWidgetContainer />
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
