import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { NotPortedPage } from "../../organization/NotPortedPage/NotPortedPage";

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/discovery/")({
  staticData: { readiness: "none" },
  component: NotPortedPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
