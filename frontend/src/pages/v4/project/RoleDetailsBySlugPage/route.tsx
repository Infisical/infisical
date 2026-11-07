import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { RoleDetailsBySlugPage } from "./RoleDetailsBySlugPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/$projectId/roles/$roleSlug"
)({
  staticData: { readiness: "full" },
  component: RoleDetailsBySlugPage,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
