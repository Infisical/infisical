import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/projects/types";

import { withOrgProductScope } from "../../../access/project/product-scope";
import { IdentityDetailsByIDPage } from "../IdentityDetailsByIDPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/secret-scanning/identities/$identityId"
)({
  staticData: { readiness: "full" },
  component: withOrgProductScope(ProjectType.SecretScanning, IdentityDetailsByIDPage),
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
