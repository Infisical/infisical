import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { SecretScanningAppConnectionsPage } from "../AppConnectionsPage";

export const Route = createFileRoute("/v4/organizations/$orgId/secret-scanning/app-connections")({
  staticData: { readiness: "full" },
  component: SecretScanningAppConnectionsPage,
  validateSearch: zodValidator(
    z.object({
      connectionId: z.string().optional(),
      connectionName: z.string().optional(),
      addConnectionApp: z.nativeEnum(AppConnection).optional()
    })
  ),
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
