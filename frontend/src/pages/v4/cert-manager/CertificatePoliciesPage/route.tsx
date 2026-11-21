import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { CertificatePoliciesPage } from "./CertificatePoliciesPage";

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/certificate-policies/")(
  {
    staticData: { readiness: "full" },
    component: CertificatePoliciesPage,
    errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
  }
);
