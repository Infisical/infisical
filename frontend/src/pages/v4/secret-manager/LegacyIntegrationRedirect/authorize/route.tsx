import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { LegacyIntegrationAuthorizeRedirect } from "../LegacyIntegrationRedirect";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/$projectId/integrations/$provider/authorize"
)({
  staticData: { readiness: "full" },
  component: LegacyIntegrationAuthorizeRedirect,
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
