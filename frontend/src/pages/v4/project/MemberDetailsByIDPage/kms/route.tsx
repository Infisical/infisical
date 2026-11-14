import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { MemberDetailsByIDPage } from "../MemberDetailsByIDPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/kms/$projectId/members/$membershipId"
)({
  staticData: { readiness: "full" },
  component: MemberDetailsByIDPage,
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
