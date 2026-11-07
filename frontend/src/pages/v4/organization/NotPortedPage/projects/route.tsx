import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { NotPortedPage } from "../NotPortedPage";

export const Route = createFileRoute("/v4/organizations/$orgId/projects/$")({
  component: NotPortedPage,
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
