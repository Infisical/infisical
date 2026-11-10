import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { IdentityDetailsByIDPage } from "../IdentityDetailsByIDPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/agent-vault/$projectId/identities/$identityId"
)({
  staticData: { readiness: "full" },
  component: IdentityDetailsByIDPage,
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
