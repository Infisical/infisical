import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { KmipServerDetailsByIDPage } from "../kmip/KmipServerDetailsByIDPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/kms/kmip-servers/$kmipServerId"
)({
  staticData: { readiness: "full" },
  component: KmipServerDetailsByIDPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
