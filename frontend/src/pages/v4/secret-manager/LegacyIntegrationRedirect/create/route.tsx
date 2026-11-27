import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { LegacyIntegrationCreateRedirect } from "../LegacyIntegrationRedirect";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/$projectId/integrations/$provider/create"
)({
  staticData: { readiness: "full" },
  component: LegacyIntegrationCreateRedirect,
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
