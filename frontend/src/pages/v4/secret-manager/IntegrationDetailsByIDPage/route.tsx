import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { IntegrationDetailsByIDPage } from "./IntegrationDetailsByIDPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/$projectId/integrations/$integrationId"
)({
  staticData: { readiness: "full" },
  component: IntegrationDetailsByIDPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
