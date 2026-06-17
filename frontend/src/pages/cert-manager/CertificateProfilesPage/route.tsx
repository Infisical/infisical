import { createFileRoute } from "@tanstack/react-router";

import { CertificateProfilesPage } from "./CertificateProfilesPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/certificate-profiles/"
)({
  component: CertificateProfilesPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Certificate Profiles"
        }
      ]
    };
  }
});
