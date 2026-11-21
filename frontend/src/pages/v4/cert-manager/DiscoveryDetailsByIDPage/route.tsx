import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { DiscoveryDetailsByIDPage } from "./DiscoveryDetailsByIDPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/cert-manager/discovery/$discoveryId"
)({
  staticData: { readiness: "full" },
  component: DiscoveryDetailsByIDPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
