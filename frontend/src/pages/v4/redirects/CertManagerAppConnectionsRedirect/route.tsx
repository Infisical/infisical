import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { CertManagerAppConnectionsRedirect } from "./CertManagerAppConnectionsRedirect";

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/app-connections")({
  staticData: { readiness: "full" },
  component: CertManagerAppConnectionsRedirect,
  errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
});
