import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { SecretManagerIndexRedirect } from "./SecretManagerIndexRedirect";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/$projectId/"
)({
  staticData: { readiness: "full" },
  component: SecretManagerIndexRedirect,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
