import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { PamIndexRedirect } from "./PamIndexRedirect";

export const Route = createFileRoute("/v4/organizations/$orgId/pam/")({
  staticData: { readiness: "full" },
  component: PamIndexRedirect,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
