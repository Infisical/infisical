import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/projects/types";

import { withOrgProductScope } from "../../../access/project/product-scope";
import { RoleDetailsBySlugPage } from "../RoleDetailsBySlugPage";

export const Route = createFileRoute("/v4/organizations/$orgId/secret-scanning/roles/$roleSlug")({
  staticData: { readiness: "full" },
  component: withOrgProductScope(ProjectType.SecretScanning, RoleDetailsBySlugPage),
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
