import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { SecretScanningIndexRedirect } from "./SecretScanningIndexRedirect";

export const Route = createFileRoute("/v4/organizations/$orgId/secret-scanning/")({
  staticData: { readiness: "partial", missing: ["Connect data source", "Data source details"] },
  component: SecretScanningIndexRedirect,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
