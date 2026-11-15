import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { HsmConnectorDetailsByIDPage } from "./HsmConnectorDetailsByIDPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/cert-manager/hsm-connectors/$connectorId"
)({
  staticData: { readiness: "full" },
  component: HsmConnectorDetailsByIDPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
