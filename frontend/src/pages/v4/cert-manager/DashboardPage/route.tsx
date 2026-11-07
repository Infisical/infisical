import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { DashboardPage } from "./DashboardPage";

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/overview")({
  component: DashboardPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
