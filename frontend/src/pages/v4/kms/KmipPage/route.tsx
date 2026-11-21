import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { KmipPage } from "../kmip/KmipPage";

export const Route = createFileRoute("/v4/organizations/$orgId/projects/kms/$projectId/kmip")({
  staticData: { readiness: "full" },
  component: KmipPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
