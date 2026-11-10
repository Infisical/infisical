import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { KmipServersPage } from "../kmip/KmipServersPage";

export const Route = createFileRoute("/v4/organizations/$orgId/projects/kms/kmip-servers/")({
  staticData: { readiness: "full" },
  component: KmipServersPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
