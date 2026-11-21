import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionsPage } from "./AppConnectionsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/app-connections/")({
  staticData: { readiness: "full" },
  component: AppConnectionsPage,
  validateSearch: zodValidator(
    z.object({
      error: z.string().optional(),
      success: z.string().optional(),
      connectionId: z.string().optional(),
      addConnectionApp: z.nativeEnum(AppConnection).optional()
    })
  ),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
