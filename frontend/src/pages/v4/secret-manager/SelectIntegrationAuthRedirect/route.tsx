import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { NotPortedPage } from "../../organization/NotPortedPage/NotPortedPage";

// Main's native integration create flow still owns this path; without its own leaf it would match
// the v4 details route's $integrationId and never reach classic.
export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/$projectId/integrations/select-integration-auth"
)({
  staticData: { readiness: "none" },
  component: NotPortedPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
