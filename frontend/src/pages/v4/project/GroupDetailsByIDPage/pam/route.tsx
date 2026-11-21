import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/projects/types";

import { withOrgProductScope } from "../../../access/project/product-scope";
import { GroupDetailsByIDPage } from "../GroupDetailsByIDPage";

export const Route = createFileRoute("/v4/organizations/$orgId/pam/groups/$groupId")({
  staticData: { readiness: "full" },
  component: withOrgProductScope(ProjectType.PAM, GroupDetailsByIDPage),
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
