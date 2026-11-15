import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { SecretInsightsPage } from "./SecretInsightsPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/insights"
)({
  staticData: { readiness: "full" },
  component: SecretInsightsPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
