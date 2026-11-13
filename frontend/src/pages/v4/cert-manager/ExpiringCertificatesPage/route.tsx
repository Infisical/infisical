import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { ExpiringCertificatesPage } from "./ExpiringCertificatesPage";

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/expiring")({
  staticData: { readiness: "full" },
  component: ExpiringCertificatesPage,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
