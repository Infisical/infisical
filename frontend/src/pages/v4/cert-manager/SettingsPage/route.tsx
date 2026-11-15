import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { SettingsPage } from "./SettingsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/settings")({
  staticData: { readiness: "full" },
  component: SettingsPage,
  validateSearch: zodValidator(
    z.object({
      selectedTab: z.string().catch("app-connections"),
      connectionId: z.string().optional(),
      connectionName: z.string().optional(),
      addConnectionApp: z.nativeEnum(AppConnection).optional()
    })
  ),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
