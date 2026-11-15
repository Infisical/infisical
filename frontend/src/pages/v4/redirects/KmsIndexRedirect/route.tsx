import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { KmsIndexRedirect } from "./KmsIndexRedirect";

export const Route = createFileRoute("/v4/organizations/$orgId/projects/kms/$projectId/")({
  staticData: { readiness: "full" },
  component: KmsIndexRedirect,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
