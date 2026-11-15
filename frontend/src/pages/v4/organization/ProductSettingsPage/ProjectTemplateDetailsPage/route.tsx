import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { NotPortedPage } from "../../NotPortedPage/NotPortedPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/product-settings/$type/project-templates/$templateId"
)({
  staticData: { readiness: "none" },
  component: NotPortedPage,
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
