import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { LegacyCertificateTemplatesRedirect } from "../LegacyCertManagerRedirect";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/cert-manager/certificate-templates/"
)({
  staticData: { readiness: "full" },
  component: LegacyCertificateTemplatesRedirect,
  errorComponent: lazyRouteComponent(() => import("../../../V4ErrorPage"), "V4ErrorPage")
});
