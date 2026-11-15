import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { CertificateProfilesPage } from "./CertificateProfilesPage";

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/certificate-profiles/")(
  {
    staticData: {
      readiness: "partial",
      missing: ["Create a certificate authority from the profile form"]
    },
    component: CertificateProfilesPage,
    errorComponent: lazyRouteComponent(() => import("../../V4ErrorPage"), "V4ErrorPage")
  }
);
