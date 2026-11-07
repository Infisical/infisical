import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { RoleDetailsBySlugPage } from "../RoleDetailsBySlugPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/kms/$projectId/roles/$roleSlug"
)({
  staticData: { readiness: "full" },
  component: RoleDetailsBySlugPage,
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
