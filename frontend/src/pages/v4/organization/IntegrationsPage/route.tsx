import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { IntegrationsListPageTabs } from "@app/types/integrations";

import { IntegrationsPage } from "./IntegrationsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/integrations")({
  component: IntegrationsPage,
  validateSearch: zodValidator(
    z.object({
      selectedTab: z.string().catch("").default(IntegrationsListPageTabs.AppConnections),
      error: z.string().optional(),
      success: z.string().optional(),
      connectionId: z.string().optional(),
      addConnectionApp: z.nativeEnum(AppConnection).optional()
    })
  ),
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
