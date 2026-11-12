import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { SecretSyncDetailsByIDPage } from "./SecretSyncDetailsByIDPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/$projectId/integrations/secret-syncs/$destination/$syncId"
)({
  staticData: { readiness: "full" },
  component: SecretSyncDetailsByIDPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
