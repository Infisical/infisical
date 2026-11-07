import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { PamAccessRedirect } from "./PamAccessRedirect";

export const Route = createFileRoute("/v4/organizations/$orgId/pam/access")({
  component: PamAccessRedirect,
  pendingComponent: lazyRouteComponent(() => import("../../V4PageLoader"), "V4PageLoader"),
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
