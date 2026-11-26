import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { CertificateDetailsByIDPage } from "../CertificateDetailsByIDPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/cert-manager/applications/$applicationName/certificates/$certificateId"
)({
  staticData: { readiness: "full" },
  component: CertificateDetailsByIDPage,
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
