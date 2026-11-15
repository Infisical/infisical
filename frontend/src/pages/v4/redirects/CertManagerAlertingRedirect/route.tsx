import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { CertManagerAlertingRedirect } from "./CertManagerAlertingRedirect";

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/alerting")({
  staticData: { readiness: "full" },
  component: CertManagerAlertingRedirect,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
