import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { PamAccessRedirect } from "./PamAccessRedirect";

export const Route = createFileRoute("/v4/organizations/$orgId/pam/access")({
  staticData: { readiness: "full" },
  component: PamAccessRedirect,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
