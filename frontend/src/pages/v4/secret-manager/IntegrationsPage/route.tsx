import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { IntegrationsPage } from "./IntegrationsPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/$projectId/integrations/"
)({
  staticData: {
    readiness: "full"
  },
  component: IntegrationsPage,
  validateSearch: zodValidator(
    z.object({
      selectedTab: z.string().optional(),
      addConnectionApp: z.nativeEnum(AppConnection).optional(),
      addSync: z.string().optional(),
      connectionId: z.string().optional(),
      connectionName: z.string().optional()
    })
  ),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
