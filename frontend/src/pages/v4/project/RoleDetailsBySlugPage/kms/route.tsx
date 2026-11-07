import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { RoleDetailsBySlugPage } from "../RoleDetailsBySlugPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/kms/$projectId/roles/$roleSlug"
)({
  component: RoleDetailsBySlugPage,
  pendingComponent: lazyRouteComponent(() => import("../../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
