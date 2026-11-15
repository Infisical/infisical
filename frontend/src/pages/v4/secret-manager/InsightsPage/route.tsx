import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { InsightsPage } from "./InsightsPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/$projectId/insights"
)({
  staticData: { readiness: "full" },
  component: InsightsPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
