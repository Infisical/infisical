import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { IdentityDetailsByIDPage } from "../IdentityDetailsByIDPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/kms/$projectId/identities/$identityId"
)({
  staticData: { readiness: "full" },
  component: IdentityDetailsByIDPage,
  pendingComponent: lazyRouteComponent(() => import("../../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
