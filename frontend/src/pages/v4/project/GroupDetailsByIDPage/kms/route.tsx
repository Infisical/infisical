import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { GroupDetailsByIDPage } from "../GroupDetailsByIDPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/kms/$projectId/groups/$groupId"
)({
  staticData: { readiness: "full" },
  component: GroupDetailsByIDPage,
  pendingComponent: lazyRouteComponent(() => import("../../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
