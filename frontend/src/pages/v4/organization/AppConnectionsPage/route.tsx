import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { NotPortedPage } from "../NotPortedPage/NotPortedPage";

export const Route = createFileRoute("/v4/organizations/$orgId/app-connections/")({
  staticData: { readiness: "none" },
  component: NotPortedPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
