import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { SecretScanningIndexRedirect } from "./SecretScanningIndexRedirect";

export const Route = createFileRoute("/v4/organizations/$orgId/secret-scanning/")({
  component: SecretScanningIndexRedirect,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader")
});
