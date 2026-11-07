import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { ProjectTypePage } from "./ProjectTypePage";

export const Route = createFileRoute("/v4/organizations/$orgId/projects/$type/")({
  component: ProjectTypePage,
  pendingComponent: lazyRouteComponent(() => import("../../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
