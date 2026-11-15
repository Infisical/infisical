import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { GithubAuthModeRedirect } from "../LegacyIntegrationRedirect";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/$projectId/integrations/github/auth-mode-selection"
)({
  staticData: { readiness: "full" },
  component: GithubAuthModeRedirect,
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
