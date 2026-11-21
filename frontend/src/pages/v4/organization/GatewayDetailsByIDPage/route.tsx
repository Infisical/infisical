import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { GatewayDetailsByIDPage } from "./GatewayDetailsByIDPage";

export const Route = createFileRoute("/v4/organizations/$orgId/networking/gateways/$gatewayId")({
  staticData: { readiness: "full" },
  component: GatewayDetailsByIDPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
