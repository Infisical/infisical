import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { GroupDetailsByIDPage } from "../GroupDetailsByIDPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/agent-vault/$projectId/groups/$groupId"
)({
  staticData: { readiness: "full" },
  component: GroupDetailsByIDPage,
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
