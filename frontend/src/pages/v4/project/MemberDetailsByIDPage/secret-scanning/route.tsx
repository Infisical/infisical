import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/projects/types";

import { withOrgProductScope } from "../../../access/project/product-scope";
import { MemberDetailsByIDPage } from "../MemberDetailsByIDPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/secret-scanning/members/$membershipId"
)({
  staticData: { readiness: "full" },
  component: withOrgProductScope(ProjectType.SecretScanning, MemberDetailsByIDPage),
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
